/**
 * End-to-end test with a generated minimal PDF.
 * Verifies: PDF -> backend -> Gemini inline data -> grounded answer.
 */
const BASE = 'http://localhost:3000';

function buildMinimalPdf(text) {
  const encoder = (s) => Buffer.from(s, 'latin1');

  const header = '%PDF-1.4\n';

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, // stream object, built below
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];

  const streamContent = `BT /F1 16 Tf 72 700 Td (${text}) Tj ET`;

  objects[3] =
    `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`;

  let pdf = header;
  const offsets = [];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');

  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  offsets.forEach((offset) => {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return encoder(pdf + xref + trailer);
}

async function main() {
  const email = `pdftest_${Date.now()}@aegis-test.local`;

  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `pdftest_${Date.now()}`,
      email,
      password: 'Test1234!'
    })
  });

  const regData = await regRes.json().catch(() => ({}));
  const token = regData.token || regData.accessToken;

  if (!token) {
    console.error('[PDF TEST] FAIL: no token');
    process.exit(1);
  }

  const pdfBuffer = buildMinimalPdf(
    'The secret code word in this document is MANGO77.'
  );

  const fileData = pdfBuffer.toString('base64');

  console.log(
    '[PDF TEST] PDF bytes:',
    pdfBuffer.length,
    '| base64 length:',
    fileData.length
  );

  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      message: 'What is the secret code word in this file? Answer with only the code word.',
      fileData,
      fileMimeType: 'application/pdf',
      fileName: 'aegis_pdf_test.pdf'
    })
  });

  const data = await res.json().catch(() => ({}));

  const reply =
    data?.message?.content || data?.error || '(no content)';

  console.log('[PDF TEST] status:', res.status, '| provider:', data.provider);
  console.log('[PDF TEST] reply:', reply.slice(0, 300));

  if (res.ok && String(reply).toUpperCase().includes('MANGO77')) {
    console.log('[PDF TEST] ✅ PASS: PDF analyzed, answer grounded in PDF content');
  } else {
    console.error('[PDF TEST] ❌ FAIL');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[PDF TEST] FAILED:', e?.message || e);
  process.exit(1);
});
