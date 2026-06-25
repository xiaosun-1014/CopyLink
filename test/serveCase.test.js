const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  contentTypeFor,
  resolveCasePath,
} = require('../src/server/serveCase');

test('resolveCasePath maps root to index.html inside case directory', () => {
  const caseDir = path.resolve('/tmp/case-a');

  assert.equal(resolveCasePath(caseDir, '/'), path.join(caseDir, 'index.html'));
  assert.equal(resolveCasePath(caseDir, '/runtime.js'), path.join(caseDir, 'runtime.js'));
});

test('resolveCasePath blocks path traversal outside case directory', () => {
  const caseDir = path.resolve('/tmp/case-a');

  assert.equal(resolveCasePath(caseDir, '/../package.json'), null);
  assert.equal(resolveCasePath(caseDir, '/..%2Fpackage.json'), null);
});

test('contentTypeFor returns common static file content types', () => {
  assert.equal(contentTypeFor('index.html'), 'text/html; charset=utf-8');
  assert.equal(contentTypeFor('runtime.js'), 'application/javascript; charset=utf-8');
  assert.equal(contentTypeFor('style.css'), 'text/css; charset=utf-8');
  assert.equal(contentTypeFor('report.png'), 'image/png');
});
