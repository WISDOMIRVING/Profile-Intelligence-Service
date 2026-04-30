const http = require('https');

function request(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: 'profile-intelligence-service-production.up.railway.app',
      path, method,
      headers: { 
        'Content-Type': 'application/json', 
        'X-API-Version': '1'
      }
    };
    if (token) {
      opts.headers['Authorization'] = `Bearer ${token}`;
    }
    if (data) {
        opts.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(opts, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ s: res.statusCode, b: JSON.parse(b) }); }
        catch { resolve({ s: res.statusCode, b }); }
      });
    });
    req.on('error', e => resolve({ s: 0, b: e.message }));
    if (data && method !== 'GET') req.write(data);
    req.end();
  });
}

async function main() {
  console.log('=== Getting Admin Token ===');
  const authRes = await request('POST', '/auth/token', { username: 'admin' });
  const token = authRes.b.access_token;
  console.log('Admin Token:', token ? 'OK' : 'FAIL');

  console.log('\n=== Testing Admin Profile Creation ===');
  const createRes = await request('POST', '/api/profiles', { name: 'Test User ' + Date.now() }, token);
  console.log('Status:', createRes.s);
  console.log('Response:', JSON.stringify(createRes.b, null, 2));

  console.log('\n=== Getting Analyst Token ===');
  const authRes2 = await request('POST', '/auth/token', { username: 'analyst' });
  const token2 = authRes2.b.access_token;
  console.log('Analyst Token:', token2 ? 'OK' : 'FAIL');

  console.log('\n=== Testing Analyst Profile Listing ===');
  const listRes = await request('GET', '/api/profiles', null, token2);
  console.log('Status:', listRes.s);
  console.log('Has Data:', listRes.b?.status === 'success' && listRes.b?.data?.length > 0);

  console.log('\n=== Testing Analyst Profile Creation (Should fail 403) ===');
  const createRes2 = await request('POST', '/api/profiles', { name: 'Forbidden User' }, token2);
  console.log('Status:', createRes2.s, '(Expected 403)');

  console.log('\n✅ Tests complete!');
}

main().catch(console.error);
