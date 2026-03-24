const fs = require('fs');
const path = require('path');

async function uploadFile(filePath, token) {
  const stats = fs.statSync(filePath);
  const fileSizeInBytes = stats.size;
  const fileStream = fs.createReadStream(filePath);
  const fileName = path.basename(filePath);

  // Using a simpler approach for multipart in Node 18+ fetch is tricky with streams.
  // We will use a Buffer instead for simplicity since the files are small.
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer]);
  
  const formData = new FormData();
  formData.append('file', blob, fileName);

  try {
    const response = await fetch('http://localhost:3000/api/documents/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    console.log(`Uploaded ${fileName}:`, response.status);
    if (!response.ok) {
       const text = await response.text();
       console.error('Response error:', text);
    }
  } catch (error) {
    console.error(`Error uploading ${fileName}:`, error.message);
  }
}

const token = 'eyJhbGciOiJFUzI1NiIsImtpZCI6IjYyN2ZjNDI0LTQyNGItNGE0My04NjhhLWZiNTQzOGI3NGUxZiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3VqcGR2amF4aXRneWtycnNibGZrLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI4NGIzNDEwZC0wOTAyLTQyNDctYTVkNi04OGZhYmU1ZTdkYmUiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc0Mzc0MDgwLCJpYXQiOjE3NzQzNzA0ODAsImVtYWlsIjoicWFfcmVncmVzc2lvbl90ZXN0QGV4YW1wbGUuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbF92ZXJpZmllZCI6dHJ1ZX0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NzQzNzA0ODB9XSwic2Vzc2lvbl9pZCI6ImVmYTJiNTJlLTYzMzUtNDEzMi1iNjM3LThkZWQ1ZjRlMWEyYSIsImlzX2Fub255bW91cyI6ZmFsc2V9.OciJtR9HFJcBXv7Bia-sPmpxIpmzuEn-6r_nOYyUdDeph8qQQeBYRbLRpQYXHd8IT6Bip7DzBQIsQ0iWZ51S4w';
const files = [
  'C:\\Users\\RAGHAD&JAD\\.gemini\\antigravity\\brain\\e78bd814-f42c-43f3-852b-82ba1d9584b5\\mock_invoice_1774369855096.png',
  'C:\\Users\\RAGHAD&JAD\\.gemini\\antigravity\\brain\\e78bd814-f42c-43f3-852b-82ba1d9584b5\\mock_receipt_1774369869757.png'
];

async function main() {
  for (const file of files) {
    if (fs.existsSync(file)) {
      await uploadFile(file, token);
    } else {
      console.error('File not found:', file);
    }
  }
}

main();
