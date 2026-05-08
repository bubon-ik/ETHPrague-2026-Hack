import '../firmware/mock/ens.js';
import { handleEnsStatus } from '../src/actions/ens/status.js';

async function test() {
  console.log('--- Testing ENS Status: greenparrot.eth (Expiring soon) ---');
  const res1 = await handleEnsStatus('When does greenparrot.eth expire?');
  console.log(res1.text);

  console.log('\n--- Testing ENS Status: vitalik.eth (Active) ---');
  const res2 = await handleEnsStatus('Status of vitalik.eth');
  console.log(res2.text);

  console.log('\n--- Testing ENS Status: alice.eth (Expired) ---');
  const res3 = await handleEnsStatus('Is alice.eth still active?');
  console.log(res3.text);
}

test();
