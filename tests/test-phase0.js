const http = require('http');

async function testPhase0() {
  console.log('==============================================');
  console.log('🧪 VERIFYING PHASE 0: REAL AI RESPONSES');
  console.log('==============================================\n');

  // 1. Register a fresh test user
  const runId = Date.now();
  const regPayload = JSON.stringify({
    username: 'phase0_' + runId,
    email: 'phase0_' + runId + '@test.local',
    password: 'Password123!'
  });

  const regRes = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: regPayload
  }).then(r => r.json());

  if (!regRes.success || !regRes.token) {
    throw new Error('Registration failed: ' + JSON.stringify(regRes));
  }
  const token = regRes.token;
  console.log('✅ User registered and authenticated successfully.');

  // 2. Test Non-streaming POST /api/chat with 'What is 2 + 2?'
  console.log('\n--- Test 1: Non-Streaming POST /api/chat ---');
  console.log('Prompt: "What is 2 + 2?"');
  const chatRes = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ message: 'What is 2 + 2?' })
  }).then(r => r.json());

  console.log('Response status:', chatRes.success);
  console.log('AI Response Text:\n', chatRes.assistantMessage?.content);

  const nonStreamContent = chatRes.assistantMessage?.content || '';
  if (nonStreamContent.includes('Thank you for your message!') || nonStreamContent.includes('Your message has been securely processed')) {
    throw new Error('FAIL: Still returned hardcoded fallback template!');
  }
  if (!nonStreamContent.includes('4')) {
    throw new Error('FAIL: AI response did not contain 4!');
  }
  console.log('✅ Non-streaming endpoint returned real AI-generated answer!');

  // 3. Test Streaming POST /api/chat/stream with 'What is 2 + 2?'
  console.log('\n--- Test 2: Streaming POST /api/chat/stream ---');
  console.log('Prompt: "What is 2 + 2?"');
  
  await new Promise((resolve, reject) => {
    const postData = JSON.stringify({ message: 'What is 2 + 2?' });
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/chat/stream',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let accumulated = '';
      let chunks = 0;
      let finalData = null;

      res.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.type === 'assistant_chunk') {
                accumulated += data.content;
                chunks++;
              }
              if (data.type === 'assistant_complete') {
                finalData = data;
              }
            } catch (e) {}
          }
        }
      });

      res.on('end', () => {
        console.log('Received streaming chunks count:', chunks);
        console.log('Accumulated Streaming Content:\n', accumulated);

        if (accumulated.includes('Thank you for your message!') || accumulated.includes('Your message has been securely processed')) {
          reject(new Error('FAIL: Streaming returned hardcoded fallback template!'));
          return;
        }
        if (!accumulated.includes('4')) {
          reject(new Error('FAIL: Streaming did not return correct mathematical result 4!'));
          return;
        }
        console.log('✅ Streaming endpoint returned real AI-generated answer with live tokens!');
        resolve();
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  // 4. Test complex question: 'Explain binary search in 2 sentences.'
  console.log('\n--- Test 3: Complex Technical Question ---');
  console.log('Prompt: "Explain binary search in 2 sentences."');
  const binaryRes = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ message: 'Explain binary search in 2 sentences.' })
  }).then(r => r.json());

  console.log('Response status:', binaryRes.success);
  console.log('AI Response Text:\n', binaryRes.assistantMessage?.content);
  if (!binaryRes.assistantMessage?.content || binaryRes.assistantMessage?.content.includes('Thank you for your message!')) {
    throw new Error('FAIL: Complex technical question failed or returned fallback!');
  }
  console.log('✅ Complex technical question answered intelligently by AI!');

  console.log('\n==============================================');
  console.log('🏁 ALL PHASE 0 VERIFICATIONS PASSED (100%)');
  console.log('==============================================');
}

testPhase0().catch(err => {
  console.error('\n❌ Error during Phase 0 test:', err);
  process.exit(1);
});

