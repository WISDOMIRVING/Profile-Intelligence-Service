const http = require('https');

function request(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'profile-intelligence-service-production.up.railway.app',
      path, method,
      headers: { 
        'X-API-Version': '1',
        'Authorization': `Bearer ${token}`
      }
    };
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.headers['Content-Length'] = Buffer.byteLength(body);
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
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
    // Get token for analyst (seeded user)
    const authRes = await request('POST', '/auth/token', JSON.stringify({ username: 'analyst' }));
    if (authRes.s !== 200) {
        console.log('Failed to get token:', authRes.s, authRes.b);
        return;
    }
    const token = authRes.b.access_token;
    
    // Check profiles
    const res = await request('GET', '/api/profiles?limit=1', null, token);
    console.log('Full Response:', JSON.stringify(res.b, null, 2));
    console.log('Profile count:', res.b?.total);
    console.log('Sample data:', res.b?.data?.[0]?.name);
}

main().catch(console.error);
