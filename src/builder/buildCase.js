const path = require('node:path');
const fs = require('node:fs');
const { copyFile, readJson } = require('../fs-utils');
const { sanitizeCaseData } = require('../model');

function defaultRuntimeDir() {
  return path.resolve(__dirname, '..', '..', 'runtime');
}

function buildCase(caseDir, options = {}) {
  const runtimeDir = options.runtimeDir || defaultRuntimeDir();
  const manifest = readJson(path.join(caseDir, 'manifest.json'));
  const actions = readJson(path.join(caseDir, 'actions.json'));
  const flowPath = path.join(caseDir, 'flow.json');
  const flow = fs.existsSync(flowPath) ? readJson(flowPath) : undefined;
  const safeCaseData = sanitizeCaseData({ manifest, actions, flow });

  for (const filename of ['index.html', 'style.css', 'runtime.js']) {
    copyFile(path.join(runtimeDir, filename), path.join(caseDir, filename));
  }

  const caseDataJs = `window.COPYLINK_CASE = ${JSON.stringify(safeCaseData, null, 2)};\n`;
  fs.writeFileSync(path.join(caseDir, 'case-data.js'), caseDataJs);

  return {
    caseDir,
    files: ['index.html', 'style.css', 'runtime.js', 'case-data.js'],
  };
}

module.exports = {
  buildCase,
};
