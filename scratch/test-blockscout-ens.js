import '../firmware/mock/ens.js';
import { handleEnsStatus } from '../src/actions/ens/status.js';

async function test() {
  console.log('--- Testing Blockscout ENS Status: vitalik.eth ---');
  const res1 = await handleEnsStatus('Status of vitalik.eth');
  console.log(res1.text);

  console.log('\n--- Testing Blockscout ENS Status: non-existent-domain-12345.eth ---');
  const res2 = await handleEnsStatus('is non-existent-domain-12345.eth available?');
  console.log(res2.text);
}

test();
