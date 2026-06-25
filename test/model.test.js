const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCaseId,
  hashUrl,
  normalizeBox,
  sanitizeCaseData,
} = require('../src/model');

test('createCaseId uses vendor and shared code when present', () => {
  const id = createCaseId(
    'https://zscloud.zs-hospital.sh.cn/film/#/shared?code=xg06q2',
    'zscloud',
  );

  assert.equal(id, 'zscloud_xg06q2');
});

test('hashUrl is stable and does not expose source URL content', () => {
  const url = 'https://example.test/shared?code=secret-code';
  const first = hashUrl(url);
  const second = hashUrl(url);

  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.equal(first.includes('secret-code'), false);
});

test('normalizeBox rounds coordinates and enforces visible dimensions', () => {
  assert.deepEqual(
    normalizeBox({ x: 10.4, y: 2.6, width: 0.2, height: 19.8 }),
    { x: 10, y: 3, width: 1, height: 20 },
  );
});

test('sanitizeCaseData removes raw URLs before generating offline case data', () => {
  const caseData = sanitizeCaseData({
    manifest: {
      id: 'zscloud_xg06q2',
      vendor: 'zscloud',
      viewport: { width: 1440, height: 960 },
      screenshots: { report: 'report.png', viewer: 'viewer.png' },
      source: {
        originalUrl: 'https://zscloud.zs-hospital.sh.cn/film/#/shared?code=xg06q2',
        viewerUrl:
          'https://zscloud.zs-hospital.sh.cn/film/web/#/web2d?patientId=secret',
        originalUrlHash: 'abc123',
        capturedAt: '2026-06-24T00:00:00.000Z',
      },
    },
    actions: { actions: [] },
  });

  assert.deepEqual(caseData.manifest.source, {
    originalUrlHash: 'abc123',
    capturedAt: '2026-06-24T00:00:00.000Z',
  });
  assert.equal(JSON.stringify(caseData).includes('patientId'), false);
  assert.equal(JSON.stringify(caseData).includes('xg06q2'), false);
});
