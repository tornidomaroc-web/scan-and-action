import fetch from 'node-fetch';

const query = 'Show recent document activity';
const url = 'http://localhost:3000/api/search';

async function testQuery() {
  console.log(`Testing query: "${query}"...`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, language: 'en' }),
    });

    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log(`Payload received: ${JSON.stringify(data).substring(0, 200)}...`);
    
    if (res.ok) {
      console.log('SUCCESS: Query is backend-safe.');
    } else {
      console.log('FAILURE: Query triggered server error.');
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
  }
}

testQuery();
