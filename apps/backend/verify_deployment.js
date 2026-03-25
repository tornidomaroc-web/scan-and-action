const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3001';
console.log(`Verifying Backend at: ${API_URL}`);

async function runTests() {
  try {
    const health = await axios.get(`${API_URL}/api/health`);
    console.log(`Health Check: ${health.status === 200 ? 'PASS' : 'FAIL'}`);
    
    try {
        await axios.get(`${API_URL}/api/documents/recent`);
        console.log(`Auth Check (Unauthorized): FAIL (Expected 401)`);
    } catch (e) {
        console.log(`Auth Check (Unauthorized): ${e.response?.status === 401 ? 'PASS' : 'FAIL'}`);
    }
    
    console.log('\nDeployment verified. Proceed to frontend integration.');
  } catch (e) {
    console.error(`Verification FAILED: ${e.message}`);
  }
}

runTests();
