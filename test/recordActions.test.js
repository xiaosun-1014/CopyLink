const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  actionShortcutScript,
  createQuickRecordedAction,
  normalizeRecordedAction,
  parseActionInput,
  persistRecordedAction,
  recordActions,
} = require('../src/recorder/recordActions');

function initialPageFromScript(script) {
  const marker = 'window.copylinkCurrentPage = ';
  const start = script.indexOf(marker);
  assert.notEqual(start, -1);
  const valueStart = start + marker.length;
  const valueEnd = script.indexOf(';', valueStart);
  return JSON.parse(script.slice(valueStart, valueEnd));
}

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

test('createQuickRecordedAction maps one-click modes to CopyLink actions', () => {
  assert.deepEqual(
    createQuickRecordedAction({
      mode: 'open_viewer',
      page: 'report',
      text: '查看影像',
      box: { x: 1, y: 2, width: 3, height: 4 },
    }),
    {
      page: 'report',
      action: 'open_viewer',
      text: '查看影像',
      targetPage: 'viewer',
      nextPage: 'viewer',
      nextMode: 'open_layout_menu',
      box: { x: 1, y: 2, width: 3, height: 4 },
    },
  );

  assert.deepEqual(
    createQuickRecordedAction({
      mode: 'open_layout_menu',
      page: 'viewer',
      text: 'layout',
      box: { x: 10, y: 20, width: 30, height: 40 },
    }),
    {
      page: 'viewer',
      action: 'open_layout_menu',
      text: 'layout',
      targetPage: 'viewer_layout_menu',
      captureTargetPage: true,
      nextPage: 'viewer_layout_menu',
      nextMode: 'set_layout',
      box: { x: 10, y: 20, width: 30, height: 40 },
    },
  );

  assert.deepEqual(
    createQuickRecordedAction({
      mode: 'select_series',
      page: 'viewer',
      text: 'AXIAL LUNG THIN',
      box: { x: 1, y: 2, width: 3, height: 4 },
    }),
    {
      page: 'viewer',
      action: 'select_series',
      text: 'AXIAL LUNG THIN',
      value: 'AXIAL_LUNG_THIN',
      targetPage: 'viewer',
      nextPage: 'viewer',
      nextMode: 'show_dicom_info',
      box: { x: 1, y: 2, width: 3, height: 4 },
    },
  );

  assert.deepEqual(
    createQuickRecordedAction({
      mode: 'adjust_ww_wl',
      page: 'viewer',
      text: 'WW',
      box: { x: 5, y: 6, width: 7, height: 8 },
      wwWlStep: 'width',
    }),
    {
      page: 'viewer',
      action: 'set_window_width',
      text: 'WW',
      nextWwWlStep: 'level',
      box: { x: 5, y: 6, width: 7, height: 8 },
    },
  );

  assert.deepEqual(
    createQuickRecordedAction({
      mode: 'adjust_ww_wl',
      page: 'viewer',
      text: 'WL',
      box: { x: 9, y: 10, width: 11, height: 12 },
      wwWlStep: 'level',
    }),
    {
      page: 'viewer',
      action: 'set_window_level',
      text: 'WL',
      nextWwWlStep: 'width',
      box: { x: 9, y: 10, width: 11, height: 12 },
    },
  );
});

test('persistRecordedAction captures target page screenshots for quick menu actions', async () => {
  const caseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copylink-record-action-'));
  fs.writeFileSync(
    path.join(caseDir, 'manifest.json'),
    JSON.stringify({
      id: 'case_a',
      vendor: 'zscloud',
      viewport: { width: 1440, height: 960 },
      screenshots: { report: 'report.png', viewer: 'viewer.png' },
    }),
  );
  fs.writeFileSync(path.join(caseDir, 'actions.json'), JSON.stringify({ actions: [] }));

  const calls = [];
  const fakePage = {
    async waitForTimeout(ms) {
      calls.push(['waitForTimeout', ms]);
    },
    async evaluate() {
      calls.push(['evaluateOverlays']);
    },
    async screenshot(options) {
      calls.push(['screenshot', path.basename(options.path), options.fullPage]);
      fs.writeFileSync(options.path, '');
    },
  };

  const action = await persistRecordedAction(
    caseDir,
    fakePage,
    {
      page: 'viewer',
      action: 'open_layout_menu',
      text: 'layout',
      targetPage: 'viewer_layout_menu',
      captureTargetPage: true,
      box: { x: 10, y: 20, width: 30, height: 40 },
    },
    { captureDelayMs: 25 },
  );

  const manifest = JSON.parse(fs.readFileSync(path.join(caseDir, 'manifest.json'), 'utf8'));
  const actions = JSON.parse(fs.readFileSync(path.join(caseDir, 'actions.json'), 'utf8'));

  assert.equal(manifest.screenshots.viewer_layout_menu, 'viewer_layout_menu.png');
  assert.deepEqual(calls, [
    ['waitForTimeout', 25],
    ['evaluateOverlays'],
    ['screenshot', 'viewer_layout_menu.png', false],
    ['evaluateOverlays'],
  ]);
  assert.deepEqual(actions.actions, [action]);
});

test('recordActions installs the visible recorder panel before waiting for network idle', async () => {
  const calls = [];
  let stopChecks = 0;
  const fakePage = {
    async goto(url, options) {
      calls.push(['goto', url, options.waitUntil]);
    },
    async waitForLoadState(state) {
      calls.push(['waitForLoadState', state]);
    },
    async evaluate(input) {
      if (typeof input === 'string') {
        calls.push(['evaluateScript']);
        return undefined;
      }
      calls.push(['evaluateFunction']);
      stopChecks += 1;
      return stopChecks === 1;
    },
    async waitForTimeout() {},
  };
  const fakeChromium = {
    async launch() {
      return {
        async newContext() {
          return {
            async addInitScript() {
              calls.push(['addInitScript']);
            },
            on(eventName) {
              calls.push(['contextOn', eventName]);
            },
            async newPage() {
              return fakePage;
            },
          };
        },
        async close() {
          calls.push(['close']);
        },
      };
    },
  };

  await recordActions('/tmp/copylink-record-actions-test', 'https://example.test/report', {
    chromium: fakeChromium,
  });

  assert.deepEqual(calls.slice(0, 5), [
    ['addInitScript'],
    ['contextOn', 'page'],
    ['goto', 'https://example.test/report', 'domcontentloaded'],
    ['evaluateScript'],
    ['waitForLoadState', 'networkidle'],
  ]);
});

test('recordActions initializes new viewer pages with viewer even when initial page is report', async () => {
  const calls = [];
  let stopChecks = 0;
  let pendingNewPage;

  const fakeNewPage = {
    async waitForLoadState(state) {
      calls.push(['newWaitForLoadState', state]);
    },
    async evaluate(input) {
      calls.push(['newEvaluateScript', initialPageFromScript(input)]);
    },
  };
  const fakePage = {
    async goto(url, options) {
      calls.push(['goto', url, options.waitUntil]);
    },
    async waitForLoadState(state) {
      calls.push(['waitForLoadState', state]);
    },
    async evaluate(input) {
      if (typeof input === 'string') {
        calls.push(['mainEvaluateScript', initialPageFromScript(input)]);
        return undefined;
      }
      stopChecks += 1;
      return stopChecks === 1;
    },
    async waitForTimeout() {},
  };
  const fakeChromium = {
    async launch() {
      return {
        async newContext() {
          return {
            async addInitScript(script) {
              calls.push(['addInitScript', initialPageFromScript(script)]);
            },
            on(eventName, handler) {
              calls.push(['contextOn', eventName]);
              pendingNewPage = handler(fakeNewPage);
            },
            async newPage() {
              return fakePage;
            },
          };
        },
        async close() {
          if (pendingNewPage) await pendingNewPage;
          calls.push(['close']);
        },
      };
    },
  };

  await recordActions('/tmp/copylink-record-actions-test', 'https://example.test/report', {
    chromium: fakeChromium,
    page: 'report',
  });

  assert.deepEqual(calls.filter((call) => call[0].endsWith('Script')), [
    ['addInitScript', 'viewer'],
    ['newEvaluateScript', 'viewer'],
    ['mainEvaluateScript', 'report'],
  ]);
});

test('actionShortcutScript exposes queue stop and current page controls', () => {
  const script = actionShortcutScript('viewer');

  assert.match(script, /window\.top !== window/);
  assert.match(script, /copylinkRecordedActions/);
  assert.match(script, /copylinkCurrentPage/);
  assert.match(script, /copylinkActionMode/);
  assert.match(script, /copylink-recorder-panel/);
  assert.match(script, /hideCopylinkPanelWhenInactive/);
  assert.match(script, /whenCopylinkDocumentReady/);
  assert.match(script, /isCopylinkTypingTarget/);
  assert.match(script, /copylinkStopRecording/);
  assert.match(script, /event\.key\.toLowerCase\(\) === 'q'/);
  assert.match(script, /recordSelectSeriesDoubleClick/);
  assert.match(script, /copylinkWwWlStep/);
  assert.match(script, /select_series/);
  assert.match(script, /copylink-overlay/);
  assert.match(script, /copylinkExplicitValue/);
  assert.match(script, /valuePlaceholderForMode/);
  assert.match(script, /quickAction\.nextMode/);
  assert.match(script, /setMode\(quickAction\.nextMode\)/);
  assert.doesNotMatch(script, /panel\.addEventListener\('click', \(event\) => event\.stopPropagation\(\), true\)/);
  assert.doesNotMatch(script, /panel\.addEventListener\('mousedown', \(event\) => event\.stopPropagation\(\), true\)/);
  assert.doesNotMatch(script, /prompt\(/);
});
