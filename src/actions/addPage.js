const path = require('node:path');
const { readJson, writeJson } = require('../fs-utils');

function addPage(caseDir, page, screenshot) {
  const manifestPath = path.join(caseDir, 'manifest.json');
  const manifest = readJson(manifestPath);
  const nextManifest = {
    ...manifest,
    screenshots: {
      ...(manifest.screenshots || {}),
      [page]: screenshot,
    },
  };
  writeJson(manifestPath, nextManifest);
  return nextManifest;
}

module.exports = {
  addPage,
};
