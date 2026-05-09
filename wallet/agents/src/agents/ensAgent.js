import { createPublicClient, http, fallback, getAddress } from 'viem';
import { mainnet } from 'viem/chains';
import axios from 'axios';
import { labelhash, normalize } from 'viem/ens';

/** Blockscout BENS API (Ethereum mainnet = chain id 1). */
const BENS_API_URL = 'https://bens.services.blockscout.com/api/v1/1/domains';

/** Canonical Base Registrar NFT for `.eth` labels on Ethereum mainnet. */
const BASE_ETH_REGISTRAR = getAddress('0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85');

const ownerOfAbi = [
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
];

function buildTransports() {
  const urls = ['https://eth.llamarpc.com', 'https://ethereum-rpc.publicnode.com'].filter(Boolean);
  if (process.env.WEB3_RPC_URL) urls.push(process.env.WEB3_RPC_URL);
  return fallback(urls.map((url) => http(url)));
}

const getClient = () =>
  createPublicClient({
    chain: mainnet,
    transport: buildTransports(),
  });

async function fetchBlockscoutStatus(canonicalDomain) {
  try {
    const response = await axios.get(`${BENS_API_URL}/${encodeURIComponent(canonicalDomain)}`, {
      headers: { accept: 'application/json' },
    });
    return {
      ok: true,
      taken: !!(response.data && response.data.name),
      httpStatus: response.status,
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return { ok: true, taken: false, httpStatus: 404 };
    }
    const msg = axios.isAxiosError(error)
      ? error.response?.status != null
        ? `HTTP ${error.response.status}`
        : error.message
      : error?.message ?? String(error);
    return { ok: false, error: msg };
  }
}

async function checkEthSecondLevelOnChain(client, canonicalDomain) {
  const parts = canonicalDomain.split('.');
  if (parts.length !== 2 || parts[1] !== 'eth' || !parts[0]) {
    return { applicable: false };
  }

  const tokenId = BigInt(labelhash(parts[0]));
  try {
    const owner = await client.readContract({
      address: BASE_ETH_REGISTRAR,
      abi: ownerOfAbi,
      functionName: 'ownerOf',
      args: [tokenId],
    });
    return { applicable: true, registered: true, owner };
  } catch (e) {
    const reverted =
      e?.cause?.name === 'ContractFunctionRevertedError' ||
      String(e?.shortMessage ?? '').toLowerCase().includes('reverted');
    if (reverted) {
      return { applicable: true, registered: false };
    }
    return { applicable: true, error: e?.shortMessage ?? e?.message ?? String(e) };
  }
}

/**
 * Availability check: ENSIP-15 normalization + Blockscout indexer + on-chain `.eth`
 * registration via Base Registrar `ownerOf` when the name is exactly `[label].eth`.
 *
 * @returns {Promise<{ status: 'AVAILABLE'|'TAKEN'|'CONFLICT'|'ERROR'; reason: string; canonicalName: string|null; sources: object }>}
 */
export async function checkDomainAvailability(domain) {
  console.log(`\n[ENS Agent]: Availability check for: ${domain}`);

  let canonical;
  try {
    canonical = normalize(domain.trim());
  } catch {
    return {
      status: 'ERROR',
      reason: 'invalid_ens_name',
      canonicalName: null,
      sources: {},
    };
  }

  const client = getClient();
  const [blockscout, onChain] = await Promise.all([
    fetchBlockscoutStatus(canonical),
    checkEthSecondLevelOnChain(client, canonical),
  ]);

  const sources = {
    blockscout: blockscout.ok
      ? { taken: blockscout.taken, httpStatus: blockscout.httpStatus }
      : { error: blockscout.error },
  };

  if (onChain.applicable) {
    if (onChain.error) {
      sources.onChain = { registrar: BASE_ETH_REGISTRAR, error: onChain.error };
    } else if (onChain.registered) {
      sources.onChain = { registrar: BASE_ETH_REGISTRAR, registered: true, owner: onChain.owner };
    } else {
      sources.onChain = { registrar: BASE_ETH_REGISTRAR, registered: false };
    }
  } else {
    sources.onChain = { skipped: true, reason: 'not_second_level_eth' };
  }

  const bsTaken = blockscout.ok ? blockscout.taken : null;
  const chainKnown = !!sources.onChain && !sources.onChain.skipped && !sources.onChain.error;
  const chainRegistered = sources.onChain?.registered === true;

  /** On-chain registrar says the label is minted. */
  if (chainRegistered) {
    if (blockscout.ok && !bsTaken) {
      return {
        status: 'TAKEN',
        reason: 'registered_on_chain_indexer_gap',
        canonicalName: canonical,
        sources,
      };
    }
    return {
      status: 'TAKEN',
      reason: 'registered_on_chain',
      canonicalName: canonical,
      sources,
    };
  }

  /** On-chain read failed (RPC / contract issue) — degrade to indexer-only or error. */
  if (onChain.applicable && onChain.error) {
    if (blockscout.ok) {
      return {
        status: bsTaken ? 'TAKEN' : 'AVAILABLE',
        reason: 'blockscout_only_rpc_error',
        canonicalName: canonical,
        sources,
      };
    }
    return {
      status: 'ERROR',
      reason: 'blockscout_and_rpc_failed',
      canonicalName: canonical,
      sources,
    };
  }

  /** Explicit second-level `.eth`: chain says NFT not minted. */
  if (chainKnown && !chainRegistered) {
    if (!blockscout.ok) {
      return {
        status: 'AVAILABLE',
        reason: 'chain_only_blockscout_failed',
        canonicalName: canonical,
        sources,
      };
    }
    if (bsTaken) {
      return {
        status: 'CONFLICT',
        reason: 'chain_unregistered_but_indexer_reports_taken',
        canonicalName: canonical,
        sources,
      };
    }
    return {
      status: 'AVAILABLE',
      reason: 'available_chain_and_indexer',
      canonicalName: canonical,
      sources,
    };
  }

  /** Subdomains, non-.eth ENS, etc.: indexer only. */
  if (blockscout.ok) {
    return {
      status: bsTaken ? 'TAKEN' : 'AVAILABLE',
      reason: 'indexer_only_not_second_level_eth',
      canonicalName: canonical,
      sources,
    };
  }

  return {
    status: 'ERROR',
    reason: 'indexer_failed',
    canonicalName: canonical,
    sources,
  };
}

/**
 * ENSIP-26 agent metadata discovery.
 */
export async function checkAgentDomain(ensName) {
  let name;
  try {
    name = normalize(ensName.trim());
  } catch {
    return { error: 'Invalid ENS name', ensName };
  }

  const client = getClient();

  try {
    const [ethAddressRecord, context, endpoint] = await Promise.all([
      client.getEnsAddress({ name }).catch(() => null),
      client.getEnsText({ name, key: 'agent-context' }),
      client.getEnsText({ name, key: 'agent-endpoint[http]' }),
    ]);

    const hasAgentRecords = !!(context || endpoint);

    return {
      ensName: name,
      resolvedAddress: ethAddressRecord ?? null,
      hasAgentRecords,
      isAgentCompliant: hasAgentRecords,
      metadata: {
        context: context || 'None',
        endpoint: endpoint || 'None',
      },
      note:
        '`resolvedAddress` is the forward ENS addr record — it can be unset for valid names.',
    };
  } catch {
    return { error: 'Failed to resolve ENSIP-26 records', ensName: name };
  }
}
