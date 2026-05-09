import { createPublicClient, http, fallback } from 'viem';
import { mainnet } from 'viem/chains';
import axios from 'axios';

const getClient = () => createPublicClient({
  chain: mainnet,
  transport: fallback([
    http('https://eth.llamarpc.com'),
    http(process.env.WEB3_RPC_URL),
  ])
});

// Blockscout BENS API for accurate ENS indexing
const BENS_API_URL = 'https://bens.services.blockscout.com/api/v1/1/domains';

/**
 * 1. Isolated Availability Check (Blockscout Only)
 * Strictly uses Blockscout's indexed data for accurate registration status.
 */
export async function checkDomainAvailability(domain) {
  console.log(`\n[ENS Agent]: Checking availability (via Blockscout) for ${domain}...`);
  
  try {
    const response = await axios.get(`${BENS_API_URL}/${domain}`, {
      headers: { 'accept': 'application/json' }
    });
    
    // If the API returns a domain object, it is TAKEN
    if (response.data && response.data.name) {
      return 'TAKEN';
    }
    
    return 'AVAILABLE';
  } catch (error) {
    // 404 means the domain is not found in the index, which implies it's AVAILABLE
    if (error.response && error.response.status === 404) {
      return 'AVAILABLE';
    }
    
    console.error(`[ENS Agent Error]: Blockscout check failed -`, error.message);
    return 'ERROR';
  }
}

/**
 * 2. ENSIP-26 Agent Metadata Discovery
 * Fetches standardized agent records.
 */
export async function checkAgentDomain(ensName) {
  const client = getClient();

  try {
    // Parallel fetch for ENSIP-26 keys
    const [context, endpoint, owner] = await Promise.all([
      client.getEnsText({ name: ensName, key: 'agent-context' }),
      client.getEnsText({ name: ensName, key: 'agent-endpoint[http]' }),
      client.getEnsAddress({ name: ensName })
    ]);

    return {
      ensName,
      status: owner ? 'ACTIVE' : 'INACTIVE',
      isAgentCompliant: !!(context || endpoint), // ENSIP-26 Check
      metadata: {
        context: context || 'None',
        endpoint: endpoint || 'None'
      },
      owner
    };
  } catch (error) {
    return { error: 'Failed to resolve ENSIP-26 records' };
  }
}