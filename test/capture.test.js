const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { captureCase } = require('../src/recorder/capture');
const { pickProfile } = require('../src/recorder/profiles');

test('pickProfile selects zscloud for zscloud links', () => {
  const profile = pickProfile(
    'https://zscloud.zs-hospital.sh.cn/film/#/shared?code=xg06q2',
  );

  assert.equal(profile.vendor, 'zscloud');
});

test('captureCase writes screenshots, manifest, and open_viewer action', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copylink-capture-'));
  const events = [];

  function fakePage(name) {
    return {
      name,
      async goto(url) {
        events.push(['goto', name, url]);
      },
      async title() {
        return '智元数影-数字影像';
      },
      url() {
        return name === 'viewer' ? 'https://example.test/viewer-sensitive-url' : 'https://example.test/report';
      },
      async waitForLoadState() {},
      async screenshot(options) {
        fs.writeFileSync(options.path, name);
      },
      waitForEvent(eventName) {
        assert.equal(eventName, 'popup');
        return Promise.resolve(viewerPage);
      },
      getByText(text) {
        return fakeLocator(text);
      },
      locator() {
        return fakeLocator('fallback');
      },
    };
  }

  function fakeLocator(text) {
    return {
      first() {
        return this;
      },
      async count() {
        return text === '查看影像' ? 1 : 0;
      },
      async boundingBox() {
        return { x: 1194.2, y: 0, width: 86.3, height: 54.1 };
      },
      async innerText() {
        return text;
      },
      async click() {
        events.push(['click', text]);
      },
    };
  }

  const reportPage = fakePage('report');
  const viewerPage = fakePage('viewer');
  const fakeChromium = {
    async launch() {
      return {
        async newContext() {
          return {
            async newPage() {
              return reportPage;
            },
          };
        },
        async close() {
          events.push(['close']);
        },
      };
    },
  };

  const result = await captureCase(
    'https://zscloud.zs-hospital.sh.cn/film/#/shared?code=xg06q2',
    outDir,
    { chromium: fakeChromium },
  );

  assert.equal(result.caseDir, outDir);
  assert.equal(fs.existsSync(path.join(outDir, 'report.png')), true);
  assert.equal(fs.existsSync(path.join(outDir, 'viewer.png')), true);

  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
  const actions = JSON.parse(fs.readFileSync(path.join(outDir, 'actions.json'), 'utf8'));

  assert.equal(manifest.vendor, 'zscloud');
  assert.equal(manifest.source.originalUrl, undefined);
  assert.equal(actions.actions[0].action, 'open_viewer');
  assert.deepEqual(actions.actions[0].box, {
    x: 1194,
    y: 0,
    width: 86,
    height: 54,
  });
  assert.deepEqual(events, [
    ['goto', 'report', 'https://zscloud.zs-hospital.sh.cn/film/#/shared?code=xg06q2'],
    ['click', '查看影像'],
    ['close'],
  ]);
});
