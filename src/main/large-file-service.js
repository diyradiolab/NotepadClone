const fs = require('fs');
const path = require('path');

const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB

/**
 * LargeFileHandle manages a single large file:
 * - Indexes line byte offsets via streaming (fast, low memory)
 * - Serves line ranges on demand
 * - Supports background search
 */
class LargeFileHandle {
  constructor(filePath) {
    this.filePath = filePath;
    this.lineOffsets = []; // byte offset of each line start
    this.totalLines = 0;
    this.fileSize = 0;
    this.indexed = false;
    this.encoding = 'utf-8';
  }

  /**
   * Index the file by scanning for newline positions.
   * Returns a progress callback for UI updates.
   */
  async index(onProgress) {
    const stats = fs.statSync(this.filePath);
    this.fileSize = stats.size;

    return new Promise((resolve, reject) => {
      this.lineOffsets = [0]; // first line always starts at byte 0
      let bytesRead = 0;

      const stream = fs.createReadStream(this.filePath, {
        encoding: null, // raw buffer
        highWaterMark: 256 * 1024, // 256KB chunks
      });

      stream.on('data', (chunk) => {
        for (let i = 0; i < chunk.length; i++) {
          if (chunk[i] === 0x0A) { // newline
            this.lineOffsets.push(bytesRead + i + 1);
          }
        }
        bytesRead += chunk.length;

        if (onProgress) {
          onProgress(Math.floor((bytesRead / this.fileSize) * 100));
        }
      });

      stream.on('end', () => {
        // If file doesn't end with newline, last offset is past end
        if (this.lineOffsets[this.lineOffsets.length - 1] > this.fileSize) {
          this.lineOffsets.pop();
        }
        this.totalLines = this.lineOffsets.length;
        this.indexed = true;
        if (onProgress) onProgress(100);
        resolve();
      });

      stream.on('error', reject);
    });
  }

  /**
   * Read a range of lines [startLine, endLine) — 0-indexed.
   * Returns an array of strings.
   */
  readLines(startLine, endLine) {
    if (!this.indexed) return [];

    startLine = Math.max(0, startLine);
    endLine = Math.min(endLine, this.totalLines);
    if (startLine >= endLine) return [];

    const startByte = this.lineOffsets[startLine];
    const endByte = endLine < this.totalLines
      ? this.lineOffsets[endLine]
      : this.fileSize;

    const length = endByte - startByte;
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(this.filePath, 'r');
    fs.readSync(fd, buffer, 0, length, startByte);
    fs.closeSync(fd);

    const text = buffer.toString(this.encoding);
    // Split and remove trailing empty string from final newline
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();

    // Strip \r from CRLF
    return lines.map(l => l.replace(/\r$/, ''));
  }

  /**
   * Search for a pattern in the file, streaming through it.
   * Calls onMatch(lineNumber, lineText) for each match.
   * Calls onProgress(percent) periodically.
   * Returns total match count.
   */
  async search(pattern, onMatch, onProgress, maxResults = 1000) {
    return new Promise((resolve, reject) => {
      let lineNumber = 0;
      let matchCount = 0;
      let bytesRead = 0;
      let remainder = '';

      const stream = fs.createReadStream(this.filePath, {
        encoding: 'utf-8',
        highWaterMark: 256 * 1024,
      });

      stream.on('data', (chunk) => {
        if (matchCount >= maxResults) {
          stream.destroy();
          return;
        }

        bytesRead += Buffer.byteLength(chunk, 'utf-8');
        const text = remainder + chunk;
        const lines = text.split('\n');
        remainder = lines.pop(); // save incomplete last line

        for (const line of lines) {
          lineNumber++;
          pattern.lastIndex = 0;
          if (pattern.test(line)) {
            matchCount++;
            if (onMatch) onMatch(lineNumber, line.replace(/\r$/, '').substring(0, 200));
            if (matchCount >= maxResults) {
              stream.destroy();
              return;
            }
          }
        }

        if (onProgress) {
          onProgress(Math.floor((bytesRead / this.fileSize) * 100));
        }
      });

      stream.on('end', () => {
        // Check remainder (last line without newline)
        if (remainder.length > 0) {
          lineNumber++;
          pattern.lastIndex = 0;
          if (pattern.test(remainder)) {
            matchCount++;
            if (onMatch) onMatch(lineNumber, remainder.substring(0, 200));
          }
        }
        if (onProgress) onProgress(100);
        resolve(matchCount);
      });

      stream.on('close', () => {
        resolve(matchCount);
      });

      stream.on('error', reject);
    });
  }

  /**
   * Write edited lines back to the file.
   * edits is an array of { line: number, text: string }
   * This rewrites the file with edits applied.
   */
  async writeEdits(edits) {
    if (edits.length === 0) return;

    // Build a map of line → new text
    const editMap = new Map();
    for (const edit of edits) {
      editMap.set(edit.line, edit.text);
    }

    // Stream-copy with edits applied
    const tmpPath = this.filePath + '.tmp';
    const writeStream = fs.createWriteStream(tmpPath, { encoding: 'utf-8' });

    return new Promise((resolve, reject) => {
      let lineNumber = 0;
      let remainder = '';

      const readStream = fs.createReadStream(this.filePath, {
        encoding: 'utf-8',
        highWaterMark: 256 * 1024,
      });

      readStream.on('data', (chunk) => {
        const text = remainder + chunk;
        const lines = text.split('\n');
        remainder = lines.pop();

        for (const line of lines) {
          const cleanLine = line.replace(/\r$/, '');
          if (editMap.has(lineNumber)) {
            writeStream.write(editMap.get(lineNumber) + '\n');
          } else {
            writeStream.write(cleanLine + '\n');
          }
          lineNumber++;
        }
      });

      readStream.on('end', () => {
        if (remainder.length > 0) {
          if (editMap.has(lineNumber)) {
            writeStream.write(editMap.get(lineNumber));
          } else {
            writeStream.write(remainder.replace(/\r$/, ''));
          }
        }
        writeStream.end();
      });

      writeStream.on('finish', () => {
        fs.renameSync(tmpPath, this.filePath);
        resolve();
      });

      readStream.on('error', (err) => {
        writeStream.destroy();
        try { fs.unlinkSync(tmpPath); } catch {}
        reject(err);
      });

      writeStream.on('error', (err) => {
        readStream.destroy();
        try { fs.unlinkSync(tmpPath); } catch {}
        reject(err);
      });
    });
  }
}

/**
 * LargeFileManager tracks all open large file handles.
 */
class LargeFileManager {
  constructor() {
    this.handles = new Map(); // filePath → LargeFileHandle
  }

  isLargeFile(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size > LARGE_FILE_THRESHOLD;
    } catch {
      return false;
    }
  }

  async open(filePath, onProgress) {
    if (this.handles.has(filePath)) {
      return this.handles.get(filePath);
    }

    const handle = new LargeFileHandle(filePath);
    await handle.index(onProgress);
    this.handles.set(filePath, handle);
    return handle;
  }

  get(filePath) {
    return this.handles.get(filePath);
  }

  close(filePath) {
    this.handles.delete(filePath);
  }
}

module.exports = { LargeFileManager, LARGE_FILE_THRESHOLD };
