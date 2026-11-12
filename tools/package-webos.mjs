#!/usr/bin/env node
/**
 * package-webos.mjs — Builds the LG webOS Hank TV package (.ipk)
 *
 * Produces a compliant webOS IPK archive that can be installed on any LG webOS TV
 * via webOS Dev Manager, LG Developer Mode, or Homebrew Channel.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const webosDir = path.join(rootDir, 'webos');
const appDir = path.join(webosDir, 'app');
const serviceDir = path.join(webosDir, 'service');

// Read appinfo.json
const appInfoPath = path.join(appDir, 'appinfo.json');
const appInfo = JSON.parse(fs.readFileSync(appInfoPath, 'utf8'));
const appId = appInfo.id || 'com.kellogs12.hank.tv';
const version = appInfo.version || '2.35.1';
const ipkFilename = `${appId}_${version}_all.ipk`;
const ipkPath = path.join(webosDir, ipkFilename);

console.log(`==> Packaging Hank for LG webOS TV (v${version})...`);

// 1. Sync latest plugin and theme
fs.copyFileSync(path.join(rootDir, 'dxbi.plugin.js'), path.join(serviceDir, 'dxbi.plugin.js'));
fs.copyFileSync(path.join(rootDir, 'dxbi.theme.css'), path.join(serviceDir, 'dxbi.theme.css'));
fs.copyFileSync(path.join(appDir, 'hank-webos.js'), path.join(serviceDir, 'hank-webos.js'));

// Fixed positive timestamp (e.g. current epoch in seconds)
const nowSeconds = Math.max(1700000000, Math.floor(Date.now() / 1000));

// --- Tar Creator ---
function makeTarHeader(name, size, type = '0', mtime = nowSeconds) {
  const buf = Buffer.alloc(512, 0);
  // Write name
  buf.write(name, 0, 100, 'utf8');
  buf.write((type === '5' ? '0000755' : '0000644') + '\0', 100, 8);
  buf.write('0000000\0', 108, 8); // uid
  buf.write('0000000\0', 116, 8); // gid
  buf.write(size.toString(8).padStart(11, '0') + '\0', 124, 12);
  buf.write(mtime.toString(8).padStart(11, '0') + '\0', 136, 12);
  buf.write('        ', 148, 8); // space for chksum
  buf.write(type, 156, 1);
  buf.write('ustar\0', 257, 6);
  buf.write('00', 263, 2);

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += buf[i];
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return buf;
}

class TarBuilder {
  constructor() {
    this.chunks = [];
  }

  addDirectory(dirPath) {
    const formatted = dirPath.endsWith('/') ? dirPath : dirPath + '/';
    this.chunks.push(makeTarHeader(formatted, 0, '5'));
  }

  addFile(filePath, buffer) {
    const header = makeTarHeader(filePath, buffer.length, '0');
    this.chunks.push(header);
    this.chunks.push(buffer);
    const padLength = (512 - (buffer.length % 512)) % 512;
    if (padLength > 0) {
      this.chunks.push(Buffer.alloc(padLength, 0));
    }
  }

  toGzip() {
    this.chunks.push(Buffer.alloc(1024, 0)); // Tar trailer
    const tarBuffer = Buffer.concat(this.chunks);
    return zlib.gzipSync(tarBuffer, { mtime: nowSeconds, level: 9 });
  }
}

// 2. Build control.tar.gz
const controlBuilder = new TarBuilder();
const controlContent = [
  `Package: ${appId}`,
  `Version: ${version}`,
  'Section: misc',
  'Priority: optional',
  'Architecture: all',
  'Maintainer: Hank',
  'Description: Hank: Netflix-style TV client for Stremio on LG webOS'
].join('\n') + '\n';

controlBuilder.addFile('./control', Buffer.from(controlContent, 'utf8'));
const controlGz = controlBuilder.toGzip();

// 3. Build data.tar.gz
const dataBuilder = new TarBuilder();
const appTargetDir = `usr/palm/applications/${appId}`;
const srvTargetDir = `usr/palm/services/${appId}.server`;

dataBuilder.addDirectory('usr');
dataBuilder.addDirectory('usr/palm');
dataBuilder.addDirectory('usr/palm/applications');
dataBuilder.addDirectory(appTargetDir);
dataBuilder.addDirectory('usr/palm/services');
dataBuilder.addDirectory(srvTargetDir);

// Add files from app/
for (const item of fs.readdirSync(appDir)) {
  const full = path.join(appDir, item);
  if (fs.statSync(full).isFile()) {
    dataBuilder.addFile(`${appTargetDir}/${item}`, fs.readFileSync(full));
  }
}

// Add files from service/
for (const item of fs.readdirSync(serviceDir)) {
  const full = path.join(serviceDir, item);
  if (fs.statSync(full).isFile()) {
    dataBuilder.addFile(`${srvTargetDir}/${item}`, fs.readFileSync(full));
  }
}

const dataGz = dataBuilder.toGzip();

// 4. Assemble the AR archive (.ipk)
function makeArHeader(name, size, mtime = nowSeconds) {
  const buf = Buffer.alloc(60, 0x20);
  buf.write(name.padEnd(16, ' '), 0, 16);
  buf.write(String(mtime).padEnd(12, ' '), 16, 12);
  buf.write('0'.padEnd(6, ' '), 28, 6);
  buf.write('0'.padEnd(6, ' '), 34, 6);
  buf.write('100644'.padEnd(8, ' '), 40, 8);
  buf.write(String(size).padEnd(10, ' '), 48, 10);
  buf[58] = 0x60; // `
  buf[59] = 0x0a; // \n
  return buf;
}

const debianBinary = Buffer.from('2.0\n');
const arChunks = [
  Buffer.from('!<arch>\n'),
  makeArHeader('debian-binary', debianBinary.length),
  debianBinary,
  makeArHeader('control.tar.gz', controlGz.length),
  controlGz,
  controlGz.length % 2 !== 0 ? Buffer.from('\n') : Buffer.alloc(0),
  makeArHeader('data.tar.gz', dataGz.length),
  dataGz,
  dataGz.length % 2 !== 0 ? Buffer.from('\n') : Buffer.alloc(0)
];

const ipkBuffer = Buffer.concat(arChunks);
fs.writeFileSync(ipkPath, ipkBuffer);

console.log(`✓ Package created successfully: ${ipkPath} (${(ipkBuffer.length / 1024).toFixed(1)} KB)`);
