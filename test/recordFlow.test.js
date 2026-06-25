const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  clickBoxForPoint,
  flowRecorderScript,
  isDuplicateFlowEvent,
  recordFlow,
} = require('../src/recorder/recordFlow');

test('clickBoxForPoint creates a stable replay hotspot around a click', () => {
  assert.deepEqual(clickBoxForPoint({ x: 20.4, y: 30.6 }), {
    x: 8,
    y: 19,
    width: 24,
    height: 24,
  });
  assert.deepEqual(clickBoxForPoint({ x: 5, y: 6 }, 20), {
    x: 0,
    y: 0,
    width: 20,
    height: 20,
  });
});

test('flowRecorderScript captures top and frame click events', () => {
  const script = flowRecorderScript('report');

  assert.match(script, /copylinkFlowEvents/);
  assert.match(script, /copylinkFlowInstalled/);
  assert.match(script, /copylink-flow-click/);
  assert.match(script, /topWindow\(\)\.postMessage/);
  assert.match(script, /copylinkStopFlow/);
  assert.match(script, /time:\s*Date\.now\(\)/);
});

test('isDuplicateFlowEvent only collapses near-identical events in a short window', () => {
  assert.equal(
    isDuplicateFlowEvent(
      { x: 100, y: 120, label: '5.0 x 5.0', time: 1000 },
      { x: 102, y: 121, label: '5.0 x 5.0', time: 1100 },
    ),
    true,
  );
  assert.equal(
    isDuplicateFlowEvent(
      { x: 100, y: 120, label: '5.0 x 5.0', time: 1000 },
      { x: 100, y: 120, label: '5.0 x 5.0', time: 1800 },
    ),
    false,
  );
  assert.equal(
    isDuplicateFlowEvent(
      { x: 100, y: 120, label: '5.0 x 5.0', time: 1000 },
      { x: 100, y: 120, label: '1*1 Shift+1', time: 1100 },
    ),
    false,
  );
});

test('recordFlow writes initial and per-click screenshots into flow.json', async () => {
  const caseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copylink-flow-'));
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
  let stopChecks = 0;
  let queueReads = 0;
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
      const source = String(input);
      if (source.includes('copylinkStopFlow')) {
        stopChecks += 1;
        return stopChecks > 2;
      }
      if (source.includes('copylinkFlowEvents')) {
        queueReads += 1;
        return queueReads === 1
          ? [{ x: 100, y: 120, label: '查看影像' }]
          : [];
      }
      calls.push(['hideOrRestoreOverlay']);
      return undefined;
    },
    async waitForTimeout(ms) {
      calls.push(['waitForTimeout', ms]);
    },
    async screenshot(options) {
      calls.push(['screenshot', path.basename(options.path), options.fullPage]);
      fs.writeFileSync(options.path, '');
    },
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

  const flow = await recordFlow(caseDir, 'https://example.test/report', {
    chromium: fakeChromium,
    captureDelayMs: 25,
    pollMs: 1,
  });

  assert.deepEqual(flow, {
    version: 1,
    startScreenshot: 'flow_000.png',
    steps: [
      {
        id: 'flow_step_001',
        screenshot: 'flow_000.png',
        nextScreenshot: 'flow_001.png',
        click: { x: 88, y: 108, width: 24, height: 24 },
        label: '查看影像',
      },
    ],
  });
  assert.equal(fs.existsSync(path.join(caseDir, 'flow_000.png')), true);
  assert.equal(fs.existsSync(path.join(caseDir, 'flow_001.png')), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(caseDir, 'flow.json'), 'utf8')), flow);
  assert.deepEqual(
    calls.filter((call) => call[0] === 'screenshot'),
    [
      ['screenshot', 'flow_000.png', false],
      ['screenshot', 'flow_001.png', false],
    ],
  );
});

test('recordFlow skips duplicate click events from repeated recorder installs', async () => {
  const caseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copylink-flow-dupe-'));
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

  let stopChecks = 0;
  let queueReads = 0;
  const screenshotNames = [];
  const fakePage = {
    async goto() {},
    async waitForLoadState() {},
    async evaluate(input) {
      if (typeof input === 'string') return undefined;
      const source = String(input);
      if (source.includes('copylinkStopFlow')) {
        stopChecks += 1;
        return stopChecks > 2;
      }
      if (source.includes('copylinkFlowEvents')) {
        queueReads += 1;
        return queueReads === 1
          ? [
              { x: 100, y: 120, label: '布局', time: 1000 },
              { x: 101, y: 120, label: '布局', time: 1010 },
            ]
          : [];
      }
      return undefined;
    },
    async waitForTimeout() {},
    async screenshot(options) {
      screenshotNames.push(path.basename(options.path));
      fs.writeFileSync(options.path, '');
    },
  };
  const fakeChromium = {
    async launch() {
      return {
        async newContext() {
          return {
            async addInitScript() {},
            on() {},
            async newPage() {
              return fakePage;
            },
          };
        },
        async close() {},
      };
    },
  };

  const flow = await recordFlow(caseDir, 'https://example.test/report', {
    chromium: fakeChromium,
    captureDelayMs: 25,
    pollMs: 1,
  });

  assert.equal(flow.steps.length, 1);
  assert.deepEqual(screenshotNames, ['flow_000.png', 'flow_001.png']);
});
