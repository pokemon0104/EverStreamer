#!/usr/bin/env node
'use strict';
// Releases 用の zip を作る:node scripts/release.js → dist/everstreamer-v<version>.zip
// 追加のパッケージは使わない(Node.js 標準の zlib だけで zip を書く)
// 含めないもの:node_modules / data(設定・APIキー・アップロードした画像)/ dist / .git
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = `everstreamer-v${pkg.version}`;
const EXCLUDE = new Set(['node_modules', 'data', 'dist', '.git', '.DS_Store', 'Thumbs.db']);
const SECRET = /youtube-key\.json$|\.env$|\.key$/i;

// ---- ファイルを集める ----
function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), r));
    else if (e.isFile()) {
      if (SECRET.test(e.name)) throw new Error(`秘密情報らしいファイルがあります / Secret-like file found: ${r}`);
      out.push(r);
    }
  }
  return out;
}

// ---- CRC32 ----
const TABLE = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function makeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const rel of files) {
    const abs = path.join(root, ...rel.split('/'));
    const data = fs.readFileSync(abs);
    const st = fs.statSync(abs);
    const zipName = Buffer.from(`${name}/${rel}`, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const { time, date } = dosTime(st.mtime);
    const exec = /\.(sh|command)$/.test(rel); // 実行権限(macOS / Linux)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 のファイル名
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(zipName.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, zipName, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE((3 << 8) | 20, 4); // 作成:UNIX(実行権限を残すため)
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(useDeflate ? 8 : 0, 10);
    cen.writeUInt16LE(time, 12);
    cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(zipName.length, 28);
    cen.writeUInt32LE(((exec ? 0o100755 : 0o100644) << 16) >>> 0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, zipName);
    offset += local.length + zipName.length + body.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cenBuf, end]);
}

const files = walk(root).sort();
const zip = makeZip(files);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', `${name}.zip`);
fs.writeFileSync(out, zip);
console.log(`${path.relative(root, out)}  (${files.length} files, ${(zip.length / 1024).toFixed(0)} KB)`);
