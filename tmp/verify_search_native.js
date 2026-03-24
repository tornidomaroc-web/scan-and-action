const http = require('http');

const data = JSON.stringify({
  query: 'Show recent document activity',
  language: 'en'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/search', // Assuming /api prefix based on previous logs
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('BODY:', body.substring(0, 100));
    if (res.statusCode === 200) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
});

req.write(data);
req.end();
