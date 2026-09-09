/**
 * Regression test: normal chat (no file) must still work after
 * the DB compatibility aliases were added.
 */
const BASE = 'http://localhost:3000';

async function main() {
  const email = `chattest_${Date.now()}@aegis-test.local`;

  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `chattest_${Date.now()}`,
      email,
      password: 'Test1234!'
    })
  });

  const regData = await regRes.json().catch(() => ({}));
  const token = regData.token || regData.accessToken;

  if (!token) {
    console.error('[REGRESSION] FAIL: no token', regData);
    process.exit(1);
  }

  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      message: 'Reply with exactly one word: OK'
    })
  });

  const data = await res.json().catch(() => ({}));

  console.log('[REGRESSION] status:', res.status, '| provider:', data.provider);
  console.log('[REGRESSION] reply:', data?.message?.content || data?.error);

  if (res.ok && data?.message?.content) {
    console.log('[REGRESSION] ✅ PASS: normal chat works without a file');
  } else {
    console.error('[REGRESSION] ❌ FAIL');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[REGRESSION] FAILED:', e?.message || e);
  process.exit(1);
});
