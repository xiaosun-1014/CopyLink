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

async function removeCopylinkOverlays(page) {
  if (typeof page.evaluate !== 'function') return;
  await page
    .evaluate(() => {
      const selectors = '#copylink-recorder-panel,#copylink-overlay';
      document.querySelectorAll(selectors).forEach((element) => element.remove());
      document.querySelectorAll('iframe').forEach((frame) => {
        try {
          frame.contentDocument
            ?.querySelectorAll(selectors)
            .forEach((element) => element.remove());
        } catch {
          // Cross-origin frames cannot be cleaned from the parent page.
        }
      });
    })
    .catch(() => {});
}

async function captureViewportScreenshot(page, filePath) {
  await removeCopylinkOverlays(page);
  await page.screenshot({
    path: filePath,
    fullPage: false,
  });
}

async function waitForViewerReady(page, profile, options = {}) {
  await waitForSettledPage(page);
  if (profile && typeof profile.waitForViewerReady === 'function') {
    await profile.waitForViewerReady(page, options).catch(() => {});
  }
  const waitMs = options.viewerWaitMs ?? 3000;
  if (waitMs > 0 && typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(waitMs).catch(() => {});
  }
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
    await captureViewportScreenshot(page, path.join(outDir, 'report.png'));

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
      await waitForViewerReady(viewerPage, profile, options);
      await captureViewportScreenshot(viewerPage, path.join(outDir, 'viewer.png'));
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
  captureViewportScreenshot,
  removeCopylinkOverlays,
  waitForViewerReady,
};
