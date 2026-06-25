const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { addPage } = require('../src/actions/addPage');

test('addPage registers an additional screenshot state in manifest.json', () => {
  const caseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copylink-page-'));
  fs.writeFileSync(
    path.join(caseDir, 'manifest.json'),
    JSON.stringify({
      id: 'case_a',
      vendor: 'zscloud',
      viewport: { width: 1440, height: 960 },
      screenshots: { report: 'report.png', viewer: 'viewer.png' },
    }),
  );

  const manifest = addPage(caseDir, 'viewer_layout_menu', 'viewer_layout_menu.png');

  assert.equal(manifest.screenshots.viewer_layout_menu, 'viewer_layout_menu.png');
  const saved = JSON.parse(fs.readFileSync(path.join(caseDir, 'manifest.json'), 'utf8'));
  assert.equal(saved.screenshots.viewer_layout_menu, 'viewer_layout_menu.png');
});
