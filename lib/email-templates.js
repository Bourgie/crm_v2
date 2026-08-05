// FlexCRM — Email Templates
// Professional HTML email templates for transactional emails

const baseStyle = `
body { margin:0; padding:0; background:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#0f172a; }
.container { max-width:560px; margin:0 auto; padding:24px; }
.card { background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.08); border:1px solid #e2e8f0; }
.header { background: linear-gradient(135deg, #6366f1, #4f46e5); padding:28px 24px; text-align:center; }
.header h1 { color:#fff; font-size:22px; margin:0; font-weight:800; letter-spacing:-.3px; }
.body { padding:28px 24px; }
.body p { font-size:15px; color:#334155; line-height:1.7; margin:0 0 16px; }
.body a { color:#6366f1; text-decoration:none; font-weight:600; }
.footer { background:#f1f5f9; padding:18px 24px; text-align:center; font-size:12px; color:#94a3b8; border-top:1px solid #e2e8f0; }
.footer a { color:#6366f1; }
.btn { display:inline-block; padding:13px 32px; background:#6366f1; color:#fff; border-radius:8px; text-decoration:none; font-size:15px; font-weight:700; }
.btn:hover { background:#4f46e5; }
.code { background:#f1f5f9; border-radius:8px; padding:14px 18px; font-family:'JetBrains Mono',monospace; font-size:14px; color:#0f172a; margin:12px 0; display:flex; gap:16px; align-items:center; }
.code .val { font-weight:700; color:#6366f1; }
.badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; }
.badge-green { background:#dcfce7; color:#16a34a; }
.badge-orange { background:#fff7ed; color:#ea580c; }
.badge-blue { background:#eff6ff; color:#2563eb; }
.list { padding:0; margin:8px 0 16px; }
.list li { font-size:14px; color:#475569; padding:6px 0; }
.list li::before { content:'✓ '; color:#22c55e; font-weight:700; }
.divider { border:none; border-top:1px solid #e2e8f0; margin:20px 0; }
.warning { background:#fef3c7; border:1px solid #f59e0b; border-radius:8px; padding:14px 18px; font-size:13px; color:#92400e; margin:16px 0; }
`

function wrap(title, content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${baseStyle}</style></head><body><div class="container"><div class="card"><div class="header"><h1>${title}</h1></div><div class="body">${content}</div><div class="footer">FlexCRM — Hecho en Argentina 🇦🇷<br><a href="https://flexcrm.com.ar">flexcrm.com.ar</a> · <a href="https://wa.me/5493517424391">WhatsApp</a></div></div></div></body></html>`;
}

// ═══ Templates ═══

function welcomeEmail(empresaNombre, codigo, usuario, appUrl) {
  return wrap('Bienvenido a FlexCRM', `
    <p>Hola <strong>${empresaNombre}</strong>,</p>
    <p>Tu cuenta de prueba de <strong>14 días</strong> está activa. Ya podés empezar a usar FlexCRM con todos los módulos incluidos.</p>
    <div class="code">
      <span style="font-size:20px">🚀</span>
      <div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Acceso</div>
        <div class="val"><a href="${appUrl}/app/login">${appUrl}/app/login</a></div>
      </div>
    </div>
    <div class="code">
      <span style="font-size:20px">🏢</span>
      <div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Empresa</div>
        <div class="val">${codigo}</div>
      </div>
    </div>
    <div class="code">
      <span style="font-size:20px">👤</span>
      <div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Usuario</div>
        <div class="val">${usuario}</div>
      </div>
    </div>
    <hr class="divider">
    <p style="font-weight:700;margin-bottom:8px">📋 Primeros pasos</p>
    <ol class="list">
      <li>Cargá tus productos desde el menú Productos (o importá por Excel)</li>
      <li>Creá usuarios para tu equipo desde Usuarios</li>
      <li>Empezá a vender desde el Punto de Venta (POS)</li>
    </ol>
    <p style="text-align:center;margin-top:20px">
      <a href="${appUrl}/app/login" class="btn">Ir a FlexCRM →</a>
    </p>
    <p style="font-size:13px;color:#94a3b8;">¿Dudas? Escribime por WhatsApp al <a href="https://wa.me/5493517424391">+54 9 351 742-4391</a>.</p>
  `);
}

function resetPasswordEmail(resetLink, empresaNombre) {
  return wrap('Restablecer contraseña', `
    <p>Recibiste este email porque solicitaste restablecer tu contraseña en <strong>${empresaNombre}</strong>.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${resetLink}" class="btn">Restablecer contraseña</a>
    </p>
    <div class="warning">Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, ignorá este mensaje.</div>
  `);
}

function passwordChangedEmail(loginLink, empresaNombre) {
  return wrap('Contraseña actualizada', `
    <div style="text-align:center;font-size:40px;margin-bottom:16px">✅</div>
    <p style="text-align:center;font-weight:600">Tu contraseña se actualizó correctamente en <strong>${empresaNombre}</strong>.</p>
    <p style="text-align:center;margin-top:20px">
      <a href="${loginLink}" class="btn">Iniciar sesión</a>
    </p>
  `);
}

function backupNotificationEmail(fecha, size, filename) {
  return wrap('Backup automático', `
    <p>Se realizó un backup automático de FlexCRM.</p>
    <div class="code">
      <span style="font-size:20px">📦</span>
      <div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Archivo</div>
        <div class="val">${filename}</div>
      </div>
    </div>
    <div class="code">
      <span style="font-size:20px">📅</span>
      <div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Fecha</div>
        <div class="val">${fecha}</div>
      </div>
    </div>
    <div class="code">
      <span style="font-size:20px">📏</span>
      <div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Tamaño</div>
        <div class="val">${size}</div>
      </div>
    </div>
    <p style="font-size:13px;color:#94a3b8;">Los backups se guardan en el servidor. Descargalos periódicamente.</p>
  `);
}

function newLeadEmail(nombre, telefono, email, mensaje, empresa, adminLink) {
  return wrap('Nuevo lead', `
    <p>Alguien completó el formulario de contacto.</p>
    <div class="code">
      <span style="font-size:20px">👤</span>
      <div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Nombre</div>
        <div class="val">${nombre}</div>
      </div>
    </div>
    ${telefono ? `<div class="code"><span style="font-size:20px">📞</span><div><div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Teléfono</div><div class="val">${telefono}</div></div></div>` : ''}
    ${email ? `<div class="code"><span style="font-size:20px">✉️</span><div><div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Email</div><div class="val">${email}</div></div></div>` : ''}
    ${empresa ? `<div class="code"><span style="font-size:20px">🏢</span><div><div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Interés</div><div class="val">${empresa}</div></div></div>` : ''}
    ${mensaje ? `<div class="code"><span style="font-size:20px">💬</span><div><div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Mensaje</div><div style="color:#334155;font-size:14px;margin-top:4px">${mensaje}</div></div></div>` : ''}
    <p style="text-align:center;margin-top:20px">
      <a href="${adminLink}" class="btn">Ver en Superadmin →</a>
    </p>
  `);
}

function signupNotificationEmail(email, empresaNombre, appUrl) {
  return wrap('Nuevo registro', `
    <p><strong>${email}</strong> creó la empresa <strong>${empresaNombre}</strong> en FlexCRM.</p>
    <p style="text-align:center;margin-top:20px">
      <a href="${appUrl}/admin" class="btn">Ir al panel →</a>
    </p>
  `);
}

function verificationEmail(empresaNombre, codigo, usuario, verifyLink, appUrl, tutorialesUrl) {
  const tutLink = tutorialesUrl || (appUrl ? (appUrl.replace(/\/$/, '') + '/tutoriales') : '#');
  return wrap('Bienvenida a FlexCRM', `
    <p>Hola ${empresaNombre},</p>
    <p>Tu cuenta de prueba de <strong>14 días</strong> está lista. Solo falta un paso: verificá tu email para activarla.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${verifyLink}" class="btn">Verificar email y empezar</a>
    </p>
    <hr class="divider">
    <p style="font-weight:700;margin-bottom:8px">Tus datos de acceso</p>
    <div class="code">
      <span style="font-size:20px">🏢</span>
      <div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Empresa</div>
        <div class="val">${codigo || '—'}</div>
      </div>
    </div>
    <div class="code">
      <span style="font-size:20px">👤</span>
      <div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Usuario</div>
        <div class="val">${usuario || '—'}</div>
      </div>
    </div>
    <div class="code">
      <span style="font-size:20px">🔗</span>
      <div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Acceso</div>
        <div class="val"><a href="${appUrl || '#'}/app/login">${appUrl || ''}/app/login</a></div>
      </div>
    </div>
    <hr class="divider">
    <p style="font-weight:700;margin-bottom:8px">Primeros pasos</p>
    <ol class="list">
      <li>Cargá tus productos desde el menú Productos (o importá por Excel)</li>
      <li>Creá usuarios para tu equipo desde Usuarios</li>
      <li>Empezá a vender desde el Punto de Venta (POS)</li>
    </ol>
    <p style="text-align:center;margin-top:20px">
      <a href="${tutLink}" class="btn" style="background:#f59e0b">Ver tutoriales</a>
    </p>
    <div class="warning">Este enlace de verificación expira en <strong>24 horas</strong>. Si no creaste una cuenta en FlexCRM, ignorá este mensaje.</div>
    <p style="font-size:13px;color:#94a3b8;margin-top:20px;">¿Dudas? Escribime por WhatsApp al <a href="https://wa.me/5493517424391">+54 9 351 742-4391</a>.</p>
    <p style="font-size:11px;color:#94a3b8;margin-top:12px;">Si el botón no funciona, copiá y pegá este link en tu navegador:<br><a href="${verifyLink}">${verifyLink}</a></p>
  `);
}

function activationEmail(empresaNombre, adminEmail, activateLink) {
  return wrap('Activá tu cuenta FlexCRM', `
    <p>Hola,</p>
    <p>Tu empresa <strong>${empresaNombre}</strong> fue creada en FlexCRM. Para comenzar a usarla, activá tu cuenta como administrador.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${activateLink}" class="btn">Activar mi cuenta</a>
    </p>
    <div class="list">
      <li>Establecé tu contraseña</li>
      <li>Aceptá los términos y condiciones en nombre de tu empresa</li>
      <li>Empezá a gestionar tu negocio</li>
    </div>
    <div class="warning">Este enlace expira en <strong>72 horas</strong>. Si ya no querés usar FlexCRM, ignorá este mensaje.</div>
    <p style="font-size:13px;color:#94a3b8;margin-top:20px;">Administrador: <strong>${adminEmail}</strong><br>Si el botón no funciona, copiá y pegá este link:<br><a href="${activateLink}">${activateLink}</a></p>
  `);
}

module.exports = {
  welcomeEmail, resetPasswordEmail, passwordChangedEmail,
  backupNotificationEmail, newLeadEmail, signupNotificationEmail,
  verificationEmail, activationEmail
};
