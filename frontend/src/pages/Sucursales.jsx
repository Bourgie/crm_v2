import { useState, useEffect, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useApp, useToast } from '../store'
import { Modal } from '../components/Modal'
import { PageHeader, Field, EmptyRow, Loader, ConfirmDialog } from '../components/UI'

const EMPTY = { nombre: '', dir: '', tel: '', email: '', notas: '' }

export function Sucursales() {
  const { api } = useApi()
  const { toast } = useToast()
  const { setSucs } = useApp()

  const [sucs, setSucsLocal] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await api('GET', '/sucursales')
      const list = Array.isArray(data) ? data : []
      setSucsLocal(list)
      setSucs(list)  // actualizar store global
    } catch { toast('Error cargando sucursales', 'err') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }))

  function openNew() { setForm(EMPTY); setModal('new') }
  function openEdit(s) { setForm({ nombre: s.nombre, dir: s.dir || '', tel: s.tel || '', email: s.email || '', notas: s.notas || '' }); setModal(s) }

  async function save() {
    if (!form.nombre.trim()) { toast('El nombre es obligatorio', 'err'); return }
    setSaving(true)
    try {
      if (modal === 'new') { await api('POST', '/sucursales', form); toast('Sucursal creada', 'ok') }
      else { await api('PUT', '/sucursales/' + modal.id, form); toast('Sucursal actualizada', 'ok') }
      setModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  if (loading) return <Loader />

  return (
    <div>
      <PageHeader title={`🏪 Sucursales (${sucs.length})`}>
        <button type="button" className="btn btn-primary" onClick={openNew}>+ Nueva sucursal</button>
      </PageHeader>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Dirección</th><th>Teléfono</th><th>Email</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {sucs.length === 0
                ? <EmptyRow cols={5} icon="🏪" text="Sin sucursales aún" />
                : sucs.map((s) => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(s)}>
                    <td style={{ fontWeight: 600 }}>{s.nombre}</td>
                    <td style={{ fontSize: 12 }}>{s.dir || '—'}</td>
                    <td style={{ fontSize: 12 }}>{s.tel || '—'}</td>
                    <td style={{ fontSize: 12 }}>{s.email || '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn btn-icon btn-sm" onClick={() => setConfirm(s.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? '+ Nueva sucursal' : `Editar: ${modal?.nombre}`}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : '💾 Guardar'}
          </button>
        </>}
      >
        <Field label="Nombre *"><input value={form.nombre} onChange={set('nombre')} placeholder="Nombre de la sucursal" /></Field>
        <Field label="Dirección"><input value={form.dir} onChange={set('dir')} placeholder="Dirección física" /></Field>
        <div className="fr">
          <Field label="Teléfono"><input value={form.tel} onChange={set('tel')} placeholder="Teléfono" /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={set('email')} placeholder="email@..." /></Field>
        </div>
        <Field label="Notas"><textarea value={form.notas} onChange={set('notas')} rows={2} style={{ resize: 'vertical' }} placeholder="Observaciones..." /></Field>
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        onConfirm={async () => { try { await api('DELETE', '/sucursales/' + confirm); toast('Sucursal eliminada', 'ok'); load() } catch (e) { toast(e.message, 'err') } }}
        title="Eliminar sucursal" message="¿Eliminás esta sucursal? Los usuarios asignados perderán acceso." confirmLabel="Sí, eliminar" />
    </div>
  )
}


