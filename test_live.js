const http = require('https');

function request(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: 'profile-intelligence-service-production.up.railway.app',
      path, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    if (body?.token) {
      opts.headers['Authorization'] = `Bearer ${body.token}`;
      opts.headers['X-API-Version'] = '1';
      delete body.token;
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

function getReq(path, token) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'profile-intelligence-service-production.up.railway.app',
      path, method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'X-API-Version': '1' }
    };
    const req = http.request(opts, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ s: res.statusCode, b: JSON.parse(b) }); }
        catch { resolve({ s: res.statusCode, b }); }
      });
    });
    req.on('error', e => resolve({ s: 0, b: e.message }));
    req.end();
  });
}

async function main() {
  // 1. Get admin token
  console.log('=== 1. Get admin token ===');
  const admin = await request('POST', '/auth/token', { username: 'admin' });
  console.log('Status:', admin.s, '| Role:', admin.b?.user?.role);

  // 2. Check /api/users/me has github_id
  console.log('\n=== 2. Check /api/users/me ===');
  const me = await getReq('/api/users/me', admin.b.access_token);
  console.log('Status:', me.s);
  console.log('Has github_id:', !!me.b?.data?.github_id, '| Value:', me.b?.data?.github_id);
  console.log('Has email:', !!me.b?.data?.email, '| Value:', me.b?.data?.email);

  // 3. Test refresh
  console.log('\n=== 3. Test refresh ===');
  const refresh = await request('POST', '/auth/refresh', { refresh_token: admin.b.refresh_token });
  console.log('Status:', refresh.s, '| Success:', refresh.b?.status);
  console.log('Has new access_token:', !!refresh.b?.access_token);
  console.log('Has new refresh_token:', !!refresh.b?.refresh_token);

  // 4. Test rate limiting on /auth/github
  console.log('\n=== 4. Rate limiting test (11 requests to /auth/github) ===');
  for (let i = 1; i <= 11; i++) {
    const r = await request('GET', '/auth/github', null);
    if (i >= 10) console.log(`Request ${i}: HTTP ${r.s}${r.s === 429 ? ' ✅ RATE LIMITED' : ''}`);
  }

  // 5. Verify /auth/refresh still works AFTER rate limit was hit
  console.log('\n=== 5. Refresh after rate limit ===');
  const admin2 = await request('POST', '/auth/token', { username: 'admin' });
  const refresh2 = await request('POST', '/auth/refresh', { refresh_token: admin2.b.refresh_token });
  console.log('Status:', refresh2.s, '| Success:', refresh2.b?.status, '(should be 200/success even after rate limit)');

  console.log('\n✅ All verifications complete!');
}

main().catch(console.error);
