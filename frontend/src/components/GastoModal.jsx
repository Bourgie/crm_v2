import { useState, useEffect } from 'react'
import { Modal } from './Modal'
import { Field } from './UI'

// Modal compartido para registrar un gasto desde su fuente (cajón o tesorería).
// Tesorería: sale siempre de la Bóveda Central. Caja: egreso del cajón (reporte diario).
export function GastoModal({ open, onClose, api, toast, fuente, sucs, sucSesion, tiposPago, onSaved, prefill, umbral, esAdmin }) {
  const [form, setForm] = useState({})
  const [cats, setCats] = useState([])
  const [saving, setSaving] = useState(false)
  const [nuevaCat, setNuevaCat] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      nombre: prefill?.nombre || '', monto: prefill?.monto || '', fecha: new Date().toISOString().substr(0, 10),
      categoria_id: prefill?.categoria_id || '', metodo_pago: (tiposPago && tiposPago[0]?.id) || 'efectivo',
      suc_id: sucSesion || '', notas: '', compromiso_id: prefill?.compromiso_id || null,
    })
    setNuevaCat('')
    api('GET', '/gastos/categorias').then((r) => setCats(Array.isArray(r) ? r : [])).catch(() => setCats([]))
  }, [open])

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }))

  async function crearCategoria() {
    const nombre = nuevaCat.trim()
    if (!nombre) { toast('Escribí el nombre de la categoría', 'err'); return }
    try {
      const cat = await api('POST', '/gastos/categorias', { nombre })
      setCats((p) => [...p, cat])
      setForm((p) => ({ ...p, categoria_id: cat.id }))
      setNuevaCat('')
      toast('Categoría creada', 'ok')
    } catch (e) { toast(e.message, 'err') }
  }

  const requiereAprobacion = fuente === 'tesoreria' && umbral > 0 && parseFloat(form.monto) >= umbral && !esAdmin

  async function save() {
    if (!form.nombre?.trim() || !form.monto || parseFloat(form.monto) <= 0) { toast('Concepto y monto requeridos', 'err'); return }
    if (fuente === 'cajon' && !form.suc_id) { toast('Elegí la sucursal (requiere caja abierta hoy)', 'err'); return }
    setSaving(true)
    try {
      await api('POST', '/gastos', {
        ...form,
        monto: parseFloat(form.monto),
        fuente,
        suc_id: form.suc_id || null,
        recurrente_id: form.compromiso_id || null,
      })
      toast(requiereAprobacion ? 'Gasto enviado a aprobación' : 'Gasto registrado', 'ok')
      onClose()
      if (onSaved) onSaved()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="💸 Registrar gasto"
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : '💾 Guardar'}
        </button>
      </>}
    >
      {fuente === 'tesoreria' && (
        <div style={{ fontSize: 12, color: 'var(--mu)', background: 'var(--sf)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          🏦 El dinero sale de la <strong>Bóveda Central</strong> (saldo general de la empresa).
        </div>
      )}
      <div className="fr">
        <Field label="Concepto *"><input value={form.nombre || ''} onChange={set('nombre')} placeholder="Ej: Alquiler local" /></Field>
        <Field label="Monto *"><input type="number" value={form.monto || ''} onChange={set('monto')} min="0" step="0.01" placeholder="0.00" /></Field>
      </div>
      <div className="fr">
        <Field label="Fecha"><input type="date" value={form.fecha || ''} onChange={set('fecha')} /></Field>
        {fuente === 'cajon' && (
          <Field label="Sucursal *">
            <select value={form.suc_id || ''} onChange={set('suc_id')}>
              {(sucs || []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Field>
        )}
      </div>
      <div className="fr">
        <Field label="Categoría">
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={form.categoria_id || ''} onChange={set('categoria_id')} style={{ flex: 1 }}>
              <option value="">Sin categoría</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
            </select>
            <input value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} placeholder="Nueva..." style={{ width: 110 }} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={crearCategoria} title="Crear categoría">+</button>
          </div>
        </Field>
        <Field label="Método de pago">
          <select value={form.metodo_pago || ''} onChange={set('metodo_pago')}>
            {(tiposPago || []).map((p) => <option key={p.id} value={p.id}>{p.icono} {p.nombre}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notas"><input value={form.notas || ''} onChange={set('notas')} placeholder="Opcional" /></Field>
      {requiereAprobacion && (
        <div style={{ fontSize: 12, color: 'var(--warn)', background: 'rgba(245,158,11,.1)', borderRadius: 8, padding: '8px 10px', marginTop: 4 }}>
          ⏳ Este monto supera el umbral de aprobación (${(umbral || 0).toLocaleString('es-AR')}). Quedará pendiente hasta que un admin lo apruebe.
        </div>
      )}
    </Modal>
  )
}
