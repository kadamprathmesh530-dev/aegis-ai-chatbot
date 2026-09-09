/**
 * Builds a minimal but valid .docx (ZIP with stored entries),
 * then runs it through POST /api/chat to verify the mammoth path.
 */
const fs = require('fs');

const BASE = 'http://localhost:3000';

// ---------- minimal ZIP writer (stored, no compression) ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);

  for (let n = 0; n < 256; n++) {
    let c = n;

    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c;
  }

  return table;
})();

function crc32(buffer) {
  let crc = -1;

  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  }

  return (crc ^ -1) >>> 0;
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);

    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);

    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  }

  const centralSize = centralParts.reduce(
    (sum, part) => sum + part.length,
    0
  );

  const end = Buffer.alloc(22);

  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

// ---------- DOCX construction ----------

function buildDocx(paragraphText) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${esc(paragraphText)}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(document, 'utf8') }
  ]);
}

// ---------- Test ----------

async function main() {
  const email = `docxtest_${Date.now()}@aegis-test.local`;

  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `docxtest_${Date.now()}`,
      email,
      password: 'Test1234!'
    })
  });

  const regData = await regRes.json().catch(() => ({}));
  const token = regData.token || regData.accessToken;

  if (!token) {
    console.error('[DOCX TEST] FAIL: no token');
    process.exit(1);
  }

  const docxBuffer = buildDocx(
    'The hidden phrase in this document is PURPLE-TIGER-99.'
  );

  fs.writeFileSync(
    'C:\\AegisAI\\tests\\aegis_docx_test.docx',
    docxBuffer
  );

  const fileData = docxBuffer.toString('base64');

  console.log(
    '[DOCX TEST] DOCX bytes:',
    docxBuffer.length,
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
      message: 'What is the hidden phrase in this document? Answer with only the phrase.',
      fileData,
      fileMimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: 'aegis_docx_test.docx'
    })
  });

  const data = await res.json().catch(() => ({}));

  const reply =
    data?.message?.content || data?.error || '(no content)';

  console.log('[DOCX TEST] status:', res.status, '| provider:', data.provider);
  console.log('[DOCX TEST] reply:', String(reply).slice(0, 300));

  if (res.ok && String(reply).toUpperCase().includes('PURPLE-TIGER-99')) {
    console.log('[DOCX TEST] ✅ PASS: DOCX extracted via mammoth, answer grounded');
  } else {
    console.error('[DOCX TEST] ❌ FAIL');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[DOCX TEST] FAILED:', e?.message || e);
  process.exit(1);
});
