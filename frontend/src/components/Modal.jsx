import { useEffect } from 'react'

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const maxW = { sm: 400, md: 520, lg: 680, xl: 860 }[size] || 520

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modal" style={{ maxWidth: maxW }}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
            color: 'var(--mu)', lineHeight: 1, padding: '0 4px'
          }}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
