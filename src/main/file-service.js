const fs = require('fs');
const path = require('path');
const chardet = require('chardet');

const ENCODING_MAP = {
  'UTF-8': 'utf-8',
  'UTF-16 LE': 'utf16le',
  'UTF-16 BE': 'utf16le',
  'ISO-8859-1': 'latin1',
  'windows-1252': 'latin1',
  'ASCII': 'utf-8',
};

function detectEncoding(buffer) {
  const detected = chardet.detect(buffer);
  return detected || 'UTF-8';
}

function normalizeEncodingName(detected) {
  if (!detected) return 'UTF-8';
  const upper = detected.toUpperCase();
  if (upper.includes('UTF-8') || upper === 'ASCII') return 'UTF-8';
  if (upper.includes('UTF-16') && upper.includes('LE')) return 'UTF-16 LE';
  if (upper.includes('UTF-16') && upper.includes('BE')) return 'UTF-16 BE';
  if (upper.includes('ISO-8859') || upper.includes('LATIN')) return 'ISO-8859-1';
  if (upper.includes('WINDOWS-1252')) return 'Windows-1252';
  return detected;
}

function detectLineEnding(content) {
  if (content.includes('\r\n')) return 'CRLF';
  if (content.includes('\r')) return 'CR';
  return 'LF';
}

async function readFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const stats = fs.statSync(filePath);

  const detectedEncoding = detectEncoding(buffer);
  const encodingName = normalizeEncodingName(detectedEncoding);
  const nodeEncoding = ENCODING_MAP[encodingName] || 'utf-8';
  const content = buffer.toString(nodeEncoding);
  const lineEnding = detectLineEnding(content);

  return {
    filePath,
    filename: path.basename(filePath),
    content,
    encoding: encodingName,
    lineEnding,
    size: stats.size,
  };
}

async function writeFile(filePath, content, encoding = 'utf-8') {
  fs.writeFileSync(filePath, content, encoding);
}

async function readDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip hidden files
    results.push({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
    });
  }

  // Sort: directories first, then alphabetical
  results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return results;
}

module.exports = { readFile, writeFile, readDirectory };
