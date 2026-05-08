import { handleQueryContacts } from '../src/actions/query/contacts.js';

async function test() {
  console.log('--- Testing Contacts Query (Blockscout Integration) ---');
  const res = await handleQueryContacts();
  console.log(res.text);
}

test();
