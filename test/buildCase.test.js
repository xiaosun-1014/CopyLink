const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildCase } = require('../src/builder/buildCase');

function makeTempCase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copylink-case-'));
  const caseDir = path.join(root, 'zscloud_xg06q2');
  fs.mkdirSync(caseDir);

  fs.writeFileSync(
    path.join(caseDir, 'manifest.json'),
    JSON.stringify(
      {
        id: 'zscloud_xg06q2',
        vendor: 'zscloud',
        viewport: { width: 1440, height: 960 },
        screenshots: { report: 'report.png', viewer: 'viewer.png' },
        source: {
          originalUrl:
            'https://zscloud.zs-hospital.sh.cn/film/#/shared?code=xg06q2',
          originalUrlHash:
            '863a737a98de252bd8d199cde336da16ff709b233ec3f6716c02bf971d4b050f',
          capturedAt: '2026-06-24T00:00:00.000Z',
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(caseDir, 'actions.json'),
    JSON.stringify(
      {
        actions: [
          {
            id: 'open_viewer_1',
            page: 'report',
            action: 'open_viewer',
            text: '查看影像',
            box: { x: 1194, y: 0, width: 86, height: 54 },
            targetPage: 'viewer',
          },
        ],
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(caseDir, 'flow.json'),
    JSON.stringify(
      {
        version: 1,
        startScreenshot: 'flow_000.png',
        steps: [
          {
            id: 'flow_step_001',
            screenshot: 'flow_000.png',
            nextScreenshot: 'flow_001.png',
            click: { x: 1194, y: 30, width: 24, height: 24 },
            label: 'open_viewer',
          },
        ],
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(caseDir, 'report.png'), '');
  fs.writeFileSync(path.join(caseDir, 'viewer.png'), '');
  fs.writeFileSync(path.join(caseDir, 'flow_000.png'), '');
  fs.writeFileSync(path.join(caseDir, 'flow_001.png'), '');

  return caseDir;
}

test('buildCase copies runtime assets and emits sanitized case data', () => {
  const caseDir = makeTempCase();

  buildCase(caseDir);

  for (const filename of ['index.html', 'style.css', 'runtime.js', 'case-data.js']) {
    assert.equal(fs.existsSync(path.join(caseDir, filename)), true);
  }

  const caseData = fs.readFileSync(path.join(caseDir, 'case-data.js'), 'utf8');
  assert.match(caseData, /window\.COPYLINK_CASE = /);
  assert.match(caseData, /open_viewer/);
  assert.match(caseData, /flow_step_001/);
  assert.doesNotMatch(caseData, /shared\?code=xg06q2/);
});
