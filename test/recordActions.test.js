const test = require('node:test');
const assert = require('node:assert/strict');

const {
  actionShortcutScript,
  normalizeRecordedAction,
  parseActionInput,
} = require('../src/recorder/recordActions');

test('parseActionInput parses action target value and page', () => {
  assert.deepEqual(parseActionInput('select_series,viewer,AXIAL_LUNG_THIN,viewer_series_menu'), {
    action: 'select_series',
    targetPage: 'viewer',
    value: 'AXIAL_LUNG_THIN',
    page: 'viewer_series_menu',
  });
});

test('parseActionInput allows omitted target and value fields', () => {
  assert.deepEqual(parseActionInput('open_layout_menu,viewer_layout_menu'), {
    action: 'open_layout_menu',
    targetPage: 'viewer_layout_menu',
    value: undefined,
    page: undefined,
  });
});

test('normalizeRecordedAction uses clicked text as select_series value when omitted', () => {
  const action = normalizeRecordedAction({
    page: 'viewer_series_menu',
    action: 'select_series',
    text: 'AXIAL LUNG THIN',
    box: { x: 1.2, y: 2.6, width: 30.1, height: 40.9 },
    targetPage: 'viewer',
  });

  assert.deepEqual(action, {
    page: 'viewer_series_menu',
    action: 'select_series',
    text: 'AXIAL LUNG THIN',
    value: 'AXIAL_LUNG_THIN',
    targetPage: 'viewer',
    box: { x: 1, y: 3, width: 30, height: 41 },
  });
});

test('actionShortcutScript exposes queue stop and current page controls', () => {
  const script = actionShortcutScript('viewer');

  assert.match(script, /copylinkRecordedActions/);
  assert.match(script, /copylinkCurrentPage/);
  assert.match(script, /copylinkStopRecording/);
  assert.match(script, /select_series/);
  assert.match(script, /copylink-overlay/);
  assert.doesNotMatch(script, /prompt\(/);
});
