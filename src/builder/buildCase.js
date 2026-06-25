const path = require('node:path');
const { copyFile, readJson } = require('../fs-utils');
const { sanitizeCaseData } = require('../model');

function defaultRuntimeDir() {
  return path.resolve(__dirname, '..', '..', 'runtime');
}

function buildCase(caseDir, options = {}) {
  const runtimeDir = options.runtimeDir || defaultRuntimeDir();
  const manifest = readJson(path.join(caseDir, 'manifest.json'));
  const actions = readJson(path.join(caseDir, 'actions.json'));
  const safeCaseData = sanitizeCaseData({ manifest, actions });

  for (const filename of ['index.html', 'style.css', 'runtime.js']) {
    copyFile(path.join(runtimeDir, filename), path.join(caseDir, filename));
  }

  const caseDataJs = `window.COPYLINK_CASE = ${JSON.stringify(safeCaseData, null, 2)};\n`;
  require('node:fs').writeFileSync(path.join(caseDir, 'case-data.js'), caseDataJs);

  return {
    caseDir,
    files: ['index.html', 'style.css', 'runtime.js', 'case-data.js'],
  };
}

module.exports = {
  buildCase,
};
