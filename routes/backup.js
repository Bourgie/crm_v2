// ═══════════════════════════════════════════════════════════
// FlexCRM — Backup automático con email SMTP
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { db } = require('../db_sqlite');
const { authMiddleware, requireRol } = require('../middleware/auth');

const DB_PATH = path.join(__dirname, '../data/crm.db');
const BACKUP_DIR = path.join(__dirname, '../data/backups');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function makeBackup() {
  ensureBackupDir();
  const ts = new Date().toISOString().replace(/[:.]/g,'-').substr(0,19);
  const dest = path.join(BACKUP_DIR, `crm-${ts}.db`);
  fs.copyFileSync(DB_PATH, dest);
  // Keep only last 30 backups
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .sort();
  if (files.length > 30) {
    files.slice(0, files.length - 30).forEach(f =>
      fs.unlinkSync(path.join(BACKUP_DIR, f))
    );
  }
  return dest;
}

async function sendBackupEmail(backupPath) {
  const cfg = db.getConfig();
  const host = cfg.smtp_host;
  const port = parseInt(cfg.smtp_port) || 465;
  const user = cfg.smtp_user;
  const pass = cfg.smtp_pass;
  const to = cfg.smtp_to;

  if (!host || !user || !pass || !to) {
    throw new Error('SMTP no configurado. Completá los campos en Configuración.');
  }

  // Dynamic require nodemailer (install if needed)
  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch(e) { throw new Error('nodemailer no instalado. Corré: npm install nodemailer'); }

  const transporter = nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' }
  });

  const fecha = new Date().toLocaleString('es-AR');
  const size = (fs.statSync(backupPath).size / 1024).toFixed(1);

  await transporter.sendMail({
    from: `"FlexCRM" <${user}>`,
    to,
    subject: `Backup automático FlexCRM — ${fecha}`,
    text: `Backup automático de FlexCRM.\n\nFecha: ${fecha}\nTamaño: ${size} KB\n\nEste archivo contiene toda la base de datos del CRM.`,
    attachments: [{
      filename: path.basename(backupPath),
      path: backupPath
    }]
  });
}

// Manual backup + email test
router.post('/test-email', authMiddleware, requireRol('admin'), async (req, res) => {
  try {
    const backupPath = makeBackup();
    await sendBackupEmail(backupPath);
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Manual backup only
router.post('/now', authMiddleware, requireRol('admin'), (req, res) => {
  try {
    const dest = makeBackup();
    res.json({ ok: true, filename: path.basename(dest) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// List backups
router.get('/backups', authMiddleware, requireRol('admin'), (req, res) => {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .sort()
      .reverse()
      .slice(0, 30)
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        const kb = (stat.size / 1024).toFixed(0);
        return {
          nombre: f,
          fecha: stat.mtime.toISOString(),
          tamaño: kb + ' KB'
        };
      });
    res.json(files);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Restore backup
router.post('/restore', authMiddleware, requireRol('admin'), (req, res) => {
  const { nombre } = req.body;
  if(!nombre || !nombre.endsWith('.db') || nombre.includes('..'))
    return res.status(400).json({ error: 'Nombre inválido' });
  const src = path.join(BACKUP_DIR, nombre);
  if(!fs.existsSync(src)) return res.status(404).json({ error: 'Backup no encontrado' });
  try {
    // Make a safety backup of current state before restoring
    makeBackup();
    fs.copyFileSync(src, DB_PATH);
    res.json({ ok: true });
    // Restart after 1 second
    setTimeout(() => process.exit(0), 1000);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// Auto backup scheduler — called from server.js
function startBackupScheduler() {
  function runBackup() {
    const cfg = db.getConfig();
    const freq = parseInt(cfg.backup_freq) || 0;
    if (freq <= 0) return;
    try {
      const backupPath = makeBackup();
      console.log(`✓ Backup automático creado: ${path.basename(backupPath)}`);
      sendBackupEmail(backupPath)
        .then(() => console.log('✓ Backup enviado por email'))
        .catch(e => console.error('✗ Error enviando backup por email:', e.message));
    } catch(e) {
      console.error('✗ Error en backup automático:', e.message);
    }
  }

  // Check every hour if backup is needed
  let lastBackup = 0;
  setInterval(() => {
    const cfg = db.getConfig();
    const freq = parseInt(cfg.backup_freq) || 0;
    if (freq <= 0) return;
    const hoursMs = freq * 60 * 60 * 1000;
    if (Date.now() - lastBackup >= hoursMs) {
      lastBackup = Date.now();
      runBackup();
    }
  }, 60 * 60 * 1000); // check every hour

  // Initial backup on startup if configured
  setTimeout(() => {
    const cfg = db.getConfig();
    if (parseInt(cfg.backup_freq) > 0) {
      lastBackup = Date.now();
      makeBackup();
      console.log('✓ Backup inicial al arrancar');
    }
  }, 5000);
}

module.exports = { router, startBackupScheduler };
