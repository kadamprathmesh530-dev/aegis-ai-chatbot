/**
 * End-to-end test of the file-upload flow against the LOCAL server.
 * Simulates exactly what the phone sends: POST /api/chat with
 * { message, fileData (base64), fileMimeType, fileName }.
 */
const fs = require('fs');

const BASE = 'http://localhost:3000';

const FILE_CONTENT = [
  'AegisAI File Upload Test Document',
  '',
  'Point 1: The capital of France is Paris.',
  'Point 2: Water boils at 100 degrees Celsius at sea level.',
  'Point 3: The largest planet in our solar system is Jupiter.',
  'Point 4: Photosynthesis converts sunlight into chemical energy.',
].join('\n');

async function main() {
  // 1. Register a unique test user (fallback: login)
  const email = `filetest_${Date.now()}@aegis-test.local`;
  const password = 'Test1234!';

  let token = null;

  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `filetest_${Date.now()}`,
      email,
      password
    })
  });

  const regData = await regRes.json().catch(() => ({}));

  if (regRes.ok && (regData.token || regData.accessToken)) {
    token = regData.token || regData.accessToken;
    console.log('[TEST] Registered test user OK');
  } else {
    console.log(
      '[TEST] Register not usable, trying login:',
      regData.error || regRes.status
    );

    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const loginData = await loginRes.json().catch(() => ({}));

    if (loginRes.ok) {
      token = loginData.token || loginData.accessToken;
    }
  }

  if (!token) {
    console.error('[TEST] FAIL: could not obtain auth token');
    process.exit(1);
  }

  console.log('[TEST] Auth token obtained (length:', token.length + ')');

  // 2. Build the request exactly like index.tsx does
  const fileData = Buffer.from(FILE_CONTENT, 'utf8').toString('base64');

  const body = {
    message:
      'Give me the 4 important points from this file.\\n\\n[Assistant Mode: Study]\\nAct as a study assistant.',
    fileData,
    fileMimeType: 'text/plain',
    fileName: 'AegisAI_File_Upload_Test.txt'
  };

  console.log(
    '[TEST] Sending POST /api/chat | fileData base64 length:',
    fileData.length,
    '| fileName:',
    body.fileName,
    '| fileMimeType:',
    body.fileMimeType
  );

  // 3. Send it
  const chatRes = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const chatData = await chatRes.json().catch(() => ({}));

  console.log('[TEST] HTTP status:', chatRes.status);
  console.log('[TEST] success:', chatData.success, '| provider:', chatData.provider);

  const reply =
    chatData?.message?.content ||
    chatData?.assistantMessage?.content ||
    chatData?.error ||
    '(no content)';

  console.log('[TEST] ---- AI RESPONSE ----');
  console.log(reply);
  console.log('[TEST] ---- END RESPONSE ----');

  // 4. Verdict: the response must reference actual file content
  const lower = String(reply).toLowerCase();
  const hits = ['paris', '100', 'jupiter', 'photosynthesis'].filter((k) =>
    lower.includes(k)
  ).length;

  const mentionedNoFile = lower.includes('don\'t see any file') ||
    lower.includes('no file attached');

  if (mentionedNoFile) {
    console.error('[TEST] ❌ FAIL: AI says it sees no file (fileData lost)');
    process.exit(2);
  }

  if (hits >= 3) {
    console.log(`[TEST] ✅ PASS: AI answer grounded in file content (${hits}/4 markers found)`);
  } else {
    console.log(`[TEST] ⚠️ WEAK: only ${hits}/4 file markers found in answer`);
    process.exit(3);
  }
}

main().catch((err) => {
  console.error('[TEST] FAILED:', err?.message || err);
  process.exit(1);
});
