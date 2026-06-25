const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { addAction } = require('../src/actions/addAction');

test('addAction appends a normalized viewer hotspot to actions.json', () => {
  const caseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copylink-action-'));
  fs.writeFileSync(path.join(caseDir, 'actions.json'), JSON.stringify({ actions: [] }));

  const action = addAction(caseDir, {
    page: 'viewer',
    action: 'show_dicom_info',
    text: 'DICOM',
    box: { x: 10.2, y: 20.7, width: 30.1, height: 40.9 },
    targetPage: 'viewer_dicom_info',
    value: 'info',
  });

  const saved = JSON.parse(fs.readFileSync(path.join(caseDir, 'actions.json'), 'utf8'));
  assert.deepEqual(action, {
    id: 'show_dicom_info_1',
    page: 'viewer',
    action: 'show_dicom_info',
    text: 'DICOM',
    box: { x: 10, y: 21, width: 30, height: 41 },
    targetPage: 'viewer_dicom_info',
    value: 'info',
  });
  assert.deepEqual(saved.actions, [action]);
});

test('addAction returns existing action when page action target and value already exist', () => {
  const caseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copylink-action-'));
  const existing = {
    id: 'open_viewer_1',
    page: 'report',
    action: 'open_viewer',
    box: { x: 1194, y: 30, width: 86, height: 24 },
    targetPage: 'viewer',
  };
  fs.writeFileSync(path.join(caseDir, 'actions.json'), JSON.stringify({ actions: [existing] }));

  const action = addAction(caseDir, {
    page: 'report',
    action: 'open_viewer',
    box: { x: 1194, y: 0, width: 86, height: 30 },
    targetPage: 'viewer',
  });

  const saved = JSON.parse(fs.readFileSync(path.join(caseDir, 'actions.json'), 'utf8'));
  assert.deepEqual(action, existing);
  assert.deepEqual(saved.actions, [existing]);
});
