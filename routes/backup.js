// ═══════════════════════════════════════════════════════════
// FlexCRM — Backup automático con ZIP de todas las DBs
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { db } = require('../db_sqlite');
const { authMiddleware, requireRol } = require('../middleware/auth');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function getAllDbFiles() {
  const files = [];
  // Master DB
  const masterPath = path.join(DATA_DIR, 'master.db');
  if (fs.existsSync(masterPath)) files.push({ name: 'master.db', path: masterPath });
  // Enterprise DBs
  try {
    fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('empresa_') && f.endsWith('.db'))
      .forEach(f => files.push({ name: f, path: path.join(DATA_DIR, f) }));
  } catch(e) { /* ignore */ }
  return files;
}

function makeFullBackup() {
  ensureBackupDir();
  const ts = new Date().toISOString().replace(/[:.]/g,'-').substr(0,19);
  const zipName = `flexcrm-full-${ts}.zip`;
  const zipPath = path.join(BACKUP_DIR, zipName);

  // Simple ZIP format (stores DBs uncompressed for speed)
  const dbFiles = getAllDbFiles();
  const entries = [];
  let centralDir = Buffer.alloc(0);
  let offset = 0;

  for (const { name, path: fp } of dbFiles) {
    const content = fs.readFileSync(fp);
    const crc = crc32(content);
    const dosDate = toDosDate(new Date());

    // Local file header
    const nameBuf = Buffer.from(name, 'utf8');
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version
    localHeader.writeUInt16LE(0x800, 6); // flags (UTF-8)
    localHeader.writeUInt16LE(0, 8); // compression (0=stored)
    localHeader.writeUInt16LE(dosDate.time, 10);
    localHeader.writeUInt16LE(dosDate.date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length
    nameBuf.copy(localHeader, 30);

    entries.push({ localHeader, content, nameBuf, crc, offset, size: content.length });
    offset += localHeader.length + content.length;

    // Central directory entry
    const cdEntry = Buffer.alloc(46 + nameBuf.length);
    cdEntry.writeUInt32LE(0x02014b50, 0);
    cdEntry.writeUInt16LE(20, 4);
    cdEntry.writeUInt16LE(20, 6);
    cdEntry.writeUInt16LE(0x800, 8);
    cdEntry.writeUInt16LE(0, 10);
    cdEntry.writeUInt16LE(dosDate.time, 12);
    cdEntry.writeUInt16LE(dosDate.date, 14);
    cdEntry.writeUInt32LE(crc, 16);
    cdEntry.writeUInt32LE(content.length, 20);
    cdEntry.writeUInt32LE(content.length, 24);
    cdEntry.writeUInt16LE(nameBuf.length, 28);
    cdEntry.writeUInt16LE(0, 30);
    cdEntry.writeUInt16LE(0, 32);
    cdEntry.writeUInt16LE(0, 34);
    cdEntry.writeUInt32LE(0, 36);
    cdEntry.writeUInt32LE(entries.length > 0 ? entries[entries.length-1].offset : 0, 42);
    nameBuf.copy(cdEntry, 46);

    const prevOffset = entries.length > 0 ? entries[entries.length - 1].offset + entries[entries.length - 1].localHeader.length + entries[entries.length - 1].size : 0;
    centralDir = Buffer.concat([centralDir, cdEntry]);
  }

  // Write ZIP
  const centralOffset = offset;
  let eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  const chunks = entries.flatMap(e => [e.localHeader, e.content]);
  chunks.push(centralDir, eocd);
  const zip = Buffer.concat(chunks);
  fs.writeFileSync(zipPath, zip);

  // Keep only last 30 backups
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.zip'))
    .sort();
  if (files.length > 30) {
    files.slice(0, files.length - 30).forEach(f =>
      fs.unlinkSync(path.join(BACKUP_DIR, f))
    );
  }

  return { path: zipPath, name: zipName, size: zip.length, dbs: dbFiles.length };
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function toDosDate(d) {
  return {
    time: (d.getSeconds() >> 1) | (d.getMinutes() << 5) | (d.getHours() << 11),
    date: d.getDate() | ((d.getMonth() + 1) << 5) | ((d.getFullYear() - 1980) << 9)
  };
}

// ── Manual backup ZIP (descarga) ──
router.post('/download', authMiddleware, requireRol('admin'), (req, res) => {
  try {
    const result = makeFullBackup();
    console.log(`[Backup] ZIP creado: ${result.name} — ${(result.size/1024).toFixed(1)}KB — ${result.dbs} DBs`);
    res.download(result.path, result.name);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── List backups ──
router.get('/list', authMiddleware, requireRol('admin'), (req, res) => {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.zip'))
      .sort().reverse().slice(0, 30)
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          nombre: f,
          fecha: stat.mtime.toISOString(),
          tamano: (stat.size / 1024).toFixed(0) + ' KB'
        };
      });
    res.json(files);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Download named backup ──
router.get('/download/:nombre', authMiddleware, requireRol('admin'), (req, res) => {
  const nombre = req.params.nombre;
  if (!nombre.endsWith('.zip') || nombre.includes('..'))
    return res.status(400).json({ error: 'Nombre inválido' });
  const fp = path.join(BACKUP_DIR, nombre);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Backup no encontrado' });
  res.download(fp, nombre);
});

// ── Auto backup scheduler ──
let lastBackup = 0;

function runAutoBackup() {
  try {
    const cfg = db.getConfig();
    const freq = parseInt(cfg.backup_freq_horas) || 24;
    if (freq <= 0) return;
    const freqMs = freq * 60 * 60 * 1000;
    if (Date.now() - lastBackup < freqMs) return;
    lastBackup = Date.now();
    const result = makeFullBackup();
    console.log(`[Backup] Auto: ${result.name} — ${(result.size/1024).toFixed(1)}KB`);
  } catch(e) {
    console.error('[Backup] Error auto:', e.message);
  }
}

function startBackupScheduler() {
  // Initial backup 10s after startup
  setTimeout(() => {
    try {
      const cfg = db.getConfig();
      if (parseInt(cfg.backup_freq_horas) > 0 || !cfg.backup_freq_horas) {
        lastBackup = Date.now();
        const result = makeFullBackup();
        console.log(`[Backup] Inicial: ${result.name}`);
      }
    } catch(e) { /* silent */ }
  }, 10000);

  // Check every hour
  setInterval(runAutoBackup, 60 * 60 * 1000);
}

module.exports = { router, startBackupScheduler, makeFullBackup };
