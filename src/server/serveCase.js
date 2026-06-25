const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function resolveCasePath(caseDir, requestPath) {
  const root = path.resolve(caseDir);
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath.split('?')[0]);
  } catch {
    return null;
  }

  const relativePath = decodedPath === '/' ? '/index.html' : decodedPath;
  const target = path.resolve(root, `.${relativePath}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
  return target;
}

function createStaticHandler(caseDir) {
  return (request, response) => {
    const target = resolveCasePath(caseDir, request.url || '/');
    if (!target) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, { 'Content-Type': contentTypeFor(target) });
    fs.createReadStream(target).pipe(response);
  };
}

function serveCase(caseDir, options = {}) {
  const port = options.port || 4173;
  const server = http.createServer(createStaticHandler(caseDir));
  server.listen(port, options.host || '127.0.0.1');
  return server;
}

module.exports = {
  contentTypeFor,
  createStaticHandler,
  resolveCasePath,
  serveCase,
};
