const path = require('node:path');
const { addAction } = require('./actions/addAction');
const { addPage } = require('./actions/addPage');
const { buildCase } = require('./builder/buildCase');
const { captureCase } = require('./recorder/capture');
const { recordActions } = require('./recorder/recordActions');
const { recordStates } = require('./recorder/recordStates');
const { pickProfile } = require('./recorder/profiles');
const { createCaseId } = require('./model');
const { serveCase } = require('./server/serveCase');

function usage() {
  return [
    'Usage:',
    '  copylink capture <url> [--out <case-dir>]',
    '  copylink build <case-dir>',
    '  copylink add-page <case-dir> <page> <screenshot>',
    '  copylink add-action <case-dir> <page> <action> --box <x,y,width,height> [--text <label>]',
    '  copylink record-states <case-dir> <url>',
    '  copylink record-actions <case-dir> <url> [--page <page-id>]',
    '  copylink serve <case-dir> [--port <port>]',
  ].join('\n');
}

function flagValue(args, flagName) {
  const index = args.indexOf(flagName);
  if (index === -1) return undefined;
  return args[index + 1];
}

function parseBox(value) {
  const parts = String(value || '')
    .split(',')
    .map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error('Expected --box <x,y,width,height>');
  }
  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

function parseCommand(argv) {
  const args = argv.slice(2);
  const command = args[0];

  if (command === 'capture') {
    const url = args[1];
    if (!url) throw new Error(usage());
    const profile = pickProfile(url);
    const outDir = flagValue(args, '--out') || path.join('cases', createCaseId(url, profile.vendor));
    return { command, url, outDir };
  }

  if (command === 'build') {
    const caseDir = args[1];
    if (!caseDir) throw new Error(usage());
    return { command, caseDir };
  }

  if (command === 'add-action') {
    const caseDir = args[1];
    const page = args[2];
    const action = args[3];
    const boxValue = flagValue(args, '--box');
    if (!caseDir || !page || !action || !boxValue) throw new Error(usage());
    return {
      command,
      caseDir,
      page,
      action,
      ...(flagValue(args, '--text') ? { text: flagValue(args, '--text') } : {}),
      ...(flagValue(args, '--target-page')
        ? { targetPage: flagValue(args, '--target-page') }
        : {}),
      ...(flagValue(args, '--value') ? { value: flagValue(args, '--value') } : {}),
      box: parseBox(boxValue),
    };
  }

  if (command === 'add-page') {
    const caseDir = args[1];
    const page = args[2];
    const screenshot = args[3];
    if (!caseDir || !page || !screenshot) throw new Error(usage());
    return { command, caseDir, page, screenshot };
  }

  if (command === 'serve') {
    const caseDir = args[1];
    if (!caseDir) throw new Error(usage());
    const port = Number(flagValue(args, '--port') || 4173);
    return { command, caseDir, port };
  }

  if (command === 'record-states') {
    const caseDir = args[1];
    const url = args[2];
    if (!caseDir || !url) throw new Error(usage());
    return { command, caseDir, url };
  }

  if (command === 'record-actions') {
    const caseDir = args[1];
    const url = args[2];
    if (!caseDir || !url) throw new Error(usage());
    return {
      command,
      caseDir,
      url,
      page: flagValue(args, '--page') || 'viewer',
    };
  }

  throw new Error(usage());
}

async function runCommand(parsed, options = {}) {
  if (parsed.command === 'capture') {
    return captureCase(parsed.url, parsed.outDir, options.captureOptions || {});
  }

  if (parsed.command === 'build') {
    return buildCase(parsed.caseDir);
  }

  if (parsed.command === 'add-action') {
    const action = addAction(parsed.caseDir, parsed);
    console.log(`Added ${action.action} hotspot to ${parsed.caseDir}`);
    return action;
  }

  if (parsed.command === 'add-page') {
    const manifest = addPage(parsed.caseDir, parsed.page, parsed.screenshot);
    console.log(`Added page ${parsed.page} -> ${parsed.screenshot}`);
    return manifest;
  }

  if (parsed.command === 'serve') {
    const server = serveCase(parsed.caseDir, { port: parsed.port });
    console.log(`Serving ${parsed.caseDir} at http://127.0.0.1:${parsed.port}`);
    return server;
  }

  if (parsed.command === 'record-states') {
    return recordStates(parsed.caseDir, parsed.url);
  }

  if (parsed.command === 'record-actions') {
    return recordActions(parsed.caseDir, parsed.url, { page: parsed.page });
  }

  throw new Error(usage());
}

async function runCli(argv) {
  const parsed = parseCommand(argv);
  return runCommand(parsed);
}

module.exports = {
  parseCommand,
  runCli,
  runCommand,
  usage,
};
