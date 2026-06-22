// ── SearchBar ──────────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = 'Buscar...', style }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--mu)', pointerEvents: 'none' }}>🔍</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ paddingLeft: 32 }}
      />
    </div>
  )
}

// ── PageHeader ─────────────────────────────────────────────────
export function PageHeader({ title, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
      {title && <h2 style={{ margin: 0 }}>{title}</h2>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
    </div>
  )
}

// ── FormField ──────────────────────────────────────────────────
export function Field({ label, children, required }) {
  return (
    <div className="fg">
      <label>{label}{required && <span style={{ color: 'var(--bad)' }}> *</span>}</label>
      {children}
    </div>
  )
}

// ── ConfirmDialog ──────────────────────────────────────────────
import { Modal } from './Modal'

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Eliminar', danger = true }) {
  return (
    <Modal open={open} onClose={onClose} title={title || '¿Confirmar?'} size="sm"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--mu)', fontSize: 14 }}>{message}</p>
    </Modal>
  )
}

// ── EmptyRow ───────────────────────────────────────────────────
export function EmptyRow({ cols, icon, text }) {
  return (
    <tr>
      <td colSpan={cols} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--mu)' }}>
        {icon && <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>}
        <div>{text || 'Sin resultados'}</div>
      </td>
    </tr>
  )
}

// ── Loader ─────────────────────────────────────────────────────
export function Loader({ text = 'Cargando...' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40, color: 'var(--mu)' }}>
      <div className="spinner" />
      <span>{text}</span>
    </div>
  )
}

// ── Pagination ─────────────────────────────────────────────────
export function Pagination({ page, total, perPage = 25, onChange }) {
  const pages = Math.ceil(total / perPage)
  if (pages <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', padding: '12px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--mu)' }}>{total} registros</span>
      <button className="btn btn-secondary btn-sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>‹</button>
      {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
        const p = pages <= 7 ? i + 1 : (page <= 4 ? i + 1 : page - 3 + i)
        if (p < 1 || p > pages) return null
        return (
          <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onChange(p)}>
            {p}
          </button>
        )
      })}
      <button className="btn btn-secondary btn-sm" onClick={() => onChange(page + 1)} disabled={page >= pages}>›</button>
    </div>
  )
}
