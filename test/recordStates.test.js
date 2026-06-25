const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  recordStates,
  screenshotNameForPage,
  shortcutScript,
} = require('../src/recorder/recordStates');

test('screenshotNameForPage creates stable png filenames from page ids', () => {
  assert.equal(screenshotNameForPage('viewer layout menu'), 'viewer_layout_menu.png');
  assert.equal(screenshotNameForPage('viewer_dicom_info'), 'viewer_dicom_info.png');
});

test('shortcutScript includes the screenshot and stop shortcuts', () => {
  const script = shortcutScript();

  assert.match(script, /copylinkCaptureState/);
  assert.match(script, /copylinkStopRecording/);
  assert.match(script, /shiftKey/);
  assert.match(script, /copylink-overlay/);
  assert.doesNotMatch(script, /prompt\(/);
});

test('recordStates installs shortcut script at browser context level', async () => {
  const calls = [];
  const fakePage = {
    async goto() {
      calls.push(['goto']);
    },
    async waitForLoadState() {},
    async evaluate(input) {
      if (typeof input === 'string') {
        calls.push(['evaluateScript']);
        return undefined;
      }
      return true;
    },
    async waitForTimeout() {},
  };
  const fakeContext = {
    async addInitScript(script) {
      calls.push(['contextAddInitScript', script.includes('copylinkCaptureState')]);
    },
    on(eventName) {
      calls.push(['contextOn', eventName]);
    },
    async newPage() {
      return fakePage;
    },
  };
  const fakeChromium = {
    async launch() {
      return {
        async newContext() {
          return fakeContext;
        },
        async close() {
          calls.push(['close']);
        },
      };
    },
  };

  await recordStates('/tmp/copylink-record-states-test', 'https://example.test', {
    chromium: fakeChromium,
  });

  assert.deepEqual(calls.filter((call) => call[0] === 'contextAddInitScript'), [
    ['contextAddInitScript', true],
  ]);
  assert.deepEqual(calls.filter((call) => call[0] === 'contextOn'), [['contextOn', 'page']]);
});

test('recordStates captures page states with viewport-sized screenshots', async () => {
  const caseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copylink-record-states-viewport-'));
  fs.writeFileSync(
    path.join(caseDir, 'manifest.json'),
    JSON.stringify({
      id: 'case_a',
      vendor: 'zscloud',
      viewport: { width: 1440, height: 960 },
      screenshots: { report: 'report.png', viewer: 'viewer.png' },
    }),
  );

  const calls = [];
  const functionResults = [false, 'viewer_layout_menu', undefined, true];
  const fakePage = {
    async goto() {},
    async waitForLoadState() {},
    async evaluate(input) {
      if (typeof input === 'string') return undefined;
      return functionResults.shift();
    },
    async screenshot(options) {
      calls.push(['screenshot', path.basename(options.path), options.fullPage]);
      fs.writeFileSync(options.path, '');
    },
    async waitForTimeout() {},
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

  const captured = await recordStates(caseDir, 'https://example.test', {
    chromium: fakeChromium,
  });

  assert.deepEqual(captured, [
    { page: 'viewer_layout_menu', screenshot: 'viewer_layout_menu.png' },
  ]);
  assert.deepEqual(calls, [['screenshot', 'viewer_layout_menu.png', false]]);
});
