const path = require('node:path');
const { createCaseId, hashUrl, normalizeBox } = require('../model');
const { ensureDir, writeJson } = require('../fs-utils');
const { pickProfile } = require('./profiles');

function loadChromium(options) {
  if (options.chromium) return options.chromium;
  try {
    return require('playwright').chromium;
  } catch (error) {
    throw new Error(
      'Playwright is required for capture. Install dependencies with `npm install` before running `copylink capture`.',
    );
  }
}

async function waitForSettledPage(page) {
  if (typeof page.waitForLoadState !== 'function') return;
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function captureCase(url, outDir, options = {}) {
  ensureDir(outDir);
  const viewport = options.viewport || { width: 1440, height: 960 };
  const profile = options.profile || pickProfile(url);
  const chromium = loadChromium(options);
  const browser = await chromium.launch({
    headless: options.headless === true,
    slowMo: options.slowMo ?? 100,
  });

  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs || 30000 });
    await waitForSettledPage(page);
    await page.screenshot({
      path: path.join(outDir, 'report.png'),
      fullPage: true,
    });

    const actions = [];
    const openViewer = await profile.findOpenViewer(page);
    let hasViewer = false;

    if (openViewer) {
      const action = {
        id: 'open_viewer_1',
        page: 'report',
        action: 'open_viewer',
        text: openViewer.text,
        box: normalizeBox(openViewer.box),
        targetPage: 'viewer',
      };
      actions.push(action);

      const popupPromise =
        typeof page.waitForEvent === 'function'
          ? page.waitForEvent('popup', { timeout: options.popupTimeoutMs || 5000 }).catch(() => null)
          : Promise.resolve(null);
      await openViewer.locator.click();
      const popup = await popupPromise;
      const viewerPage = popup || page;
      await waitForSettledPage(viewerPage);
      await viewerPage.screenshot({
        path: path.join(outDir, 'viewer.png'),
        fullPage: true,
      });
      hasViewer = true;
    }

    const manifest = {
      id: createCaseId(url, profile.vendor),
      vendor: profile.vendor,
      viewport,
      screenshots: {
        report: 'report.png',
        ...(hasViewer ? { viewer: 'viewer.png' } : {}),
      },
      source: {
        originalUrlHash: hashUrl(url),
        capturedAt: new Date().toISOString(),
      },
    };

    writeJson(path.join(outDir, 'manifest.json'), manifest);
    writeJson(path.join(outDir, 'actions.json'), { actions });

    return {
      caseDir: outDir,
      manifest,
      actions: { actions },
    };
  } finally {
    await browser.close();
  }
}

module.exports = {
  captureCase,
};
