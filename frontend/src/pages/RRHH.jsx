import { useState, useEffect, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useApp, useToast } from '../store'
import { Modal } from '../components/Modal'
import { PageHeader, Field, Loader } from '../components/UI'

const TIPOS_AUSENCIA = [
  { id: 'vacaciones', label: '🏖️ Vacaciones' },
  { id: 'enfermedad', label: '🤒 Enfermedad' },
  { id: 'licencia', label: '📋 Licencia' },
  { id: 'otro', label: '📌 Otro' },
]

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })

function EmpleadosTab({ api, toast, allSucs }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [form, setForm] = useState({ nombre: '', apellido: '', dni: '', cuil: '', tel: '', email: '', direccion: '', fecha_ingreso: '', puesto: '', salario: '', obra_social: '', suc_id: '', notas: '' })
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState([])
  const [sueldoModal, setSueldoModal] = useState(null)
  const [sueldoForm, setSueldoForm] = useState({ monto: '', fecha: new Date().toISOString().substr(0, 10), fuente: 'tesoreria', cuenta_id: '', suc_id: '', metodo: 'transferencia' })
  const [sueldoSaving, setSueldoSaving] = useState(false)
  const [cuentasTes, setCuentasTes] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [emps, usrs, cuentas] = await Promise.all([
        api('GET', '/rrhh/empleados'),
        api('GET', '/auth/usuarios').catch(() => []),
        api('GET', '/tesoreria/cuentas').catch(() => []),
      ])
      setList(Array.isArray(emps) ? emps : [])
      setUsers(Array.isArray(usrs) ? usrs : [])
      setCuentasTes(Array.isArray(cuentas) ? cuentas : [])
    } catch { setList([]) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = list.filter(e => {
    if (search) {
      const q = search.toLowerCase()
      if (!(e.nombre||'').toLowerCase().includes(q) && !(e.apellido||'').toLowerCase().includes(q) && !(e.dni||'').includes(q)) return false
    }
    return true
  })

  const linkedUserIds = new Set(list.filter(e => e.usuario_id).map(e => e.usuario_id))

  function openNew() { setForm({ nombre: '', apellido: '', dni: '', cuil: '', tel: '', email: '', direccion: '', fecha_ingreso: '', puesto: '', salario: '', obra_social: '', suc_id: '', notas: '', vincular_usuario_id: '' }); setModal('new') }
  function openEdit(e) { setForm({ nombre: e.nombre, apellido: e.apellido||'', dni: e.dni||'', cuil: e.cuil||'', tel: e.tel||'', email: e.email||'', direccion: e.direccion||'', fecha_ingreso: e.fecha_ingreso||'', puesto: e.puesto||'', salario: String(e.salario||''), obra_social: e.obra_social||'', suc_id: e.suc_id||'', notas: e.notas||'', vincular_usuario_id: e.usuario_id||'' }); setModal(e) }

  const set = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }))

  async function save() {
    if (!form.nombre.trim()) { toast('Nombre requerido', 'err'); return }
    setSaving(true)
    try {
      const body = { ...form }
      if (!body.vincular_usuario_id) delete body.vincular_usuario_id
      if (modal === 'new') {
        await api('POST', '/rrhh/empleados', body)
        toast('Empleado creado', 'ok')
      } else {
        await api('PUT', '/rrhh/empleados/' + modal.id, body)
        toast('Empleado actualizado', 'ok')
      }
      setModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function toggleActivo(e) {
    try { await api('PUT', '/rrhh/empleados/' + e.id, { activo: !e.activo }); toast(e.activo ? 'Empleado desactivado' : 'Empleado activado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }

  function openSueldo(e) {
    setSueldoForm({ monto: String(e.salario || ''), fecha: new Date().toISOString().substr(0, 10), fuente: 'tesoreria', cuenta_id: '', suc_id: e.suc_id || '', metodo: 'transferencia' })
    setSueldoModal(e)
  }

  async function saveSueldo() {
    if (!sueldoForm.monto || parseFloat(sueldoForm.monto) <= 0) { toast('Monto inválido', 'err'); return }
    if (sueldoForm.fuente === 'tesoreria' && !sueldoForm.cuenta_id) { toast('Elegí la cuenta de tesorería', 'err'); return }
    if (sueldoForm.fuente === 'cajon' && !sueldoForm.suc_id) { toast('Elegí la sucursal del cajón', 'err'); return }
    setSueldoSaving(true)
    try {
      await api('POST', '/rrhh/sueldos/pagar', { ...sueldoForm, empleado_id: sueldoModal.id, monto: parseFloat(sueldoForm.monto), medio: sueldoForm.metodo === 'efectivo' ? 'efectivo' : 'transferencia' })
      toast('Sueldo pagado', 'ok')
      setSueldoModal(null)
    } catch (e) { toast(e.message, 'err') }
    finally { setSueldoSaving(false) }
  }

  if (loading) return <Loader />

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar nombre, apellido o DNI..." style={{ flex: 1, minWidth: 180 }} />
        <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo empleado</button>
      </div>

      {filtered.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--mu)', fontSize: 13 }}>{search ? 'Sin resultados' : 'Sin empleados cargados'}</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg)', cursor: 'pointer' }}
              onClick={() => setDetalle(detalle?.id === e.id ? null : e)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{e.nombre} {e.apellido || ''}</div>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 1 }}>
                  {e.puesto && <>{e.puesto} · </>}{e.dni && <>DNI {e.dni} · </>}
                  {e.suc_id && <>{(allSucs.find(s => s.id === e.suc_id) || {}).nombre || e.suc_id}</>}
                  {e.usuario_nombre && <span className="badge badge-blue" style={{fontSize:9,marginLeft:4}}>👤 {e.usuario_nombre}</span>}
                </div>
              </div>
              <span className={`badge ${e.activo ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 10 }}>{e.activo ? 'Activo' : 'Inactivo'}</span>
              <button type="button" className="btn btn-sm" title="Pagar sueldo" onClick={ev => { ev.stopPropagation(); openSueldo(e) }} style={{ padding: '3px 8px', fontSize: 11, background: '#dcfce7', color: '#15803d', border: 'none' }}>💵</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); openEdit(e) }} style={{ padding: '3px 8px', fontSize: 11 }}>✏️</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); toggleActivo(e) }} style={{ padding: '3px 8px', fontSize: 11 }}>{e.activo ? '🚫' : '✅'}</button>
            </div>
          ))}
        </div>
      )}

      {/* Detalle empleado */}
      {detalle && <DetalleEmpleado empleado={detalle} api={api} toast={toast} onUpdate={load} />}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>{modal === 'new' ? '+ Nuevo empleado' : 'Editar empleado'}</h3>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="fr">
                <Field label="Nombre"><input value={form.nombre} onChange={set('nombre')} placeholder="Nombre" /></Field>
                <Field label="Apellido"><input value={form.apellido} onChange={set('apellido')} placeholder="Apellido" /></Field>
              </div>
              <div className="fr">
                <Field label="DNI"><input value={form.dni} onChange={set('dni')} placeholder="DNI" /></Field>
                <Field label="CUIL"><input value={form.cuil} onChange={set('cuil')} placeholder="CUIL" /></Field>
              </div>
              <div className="fr">
                <Field label="Teléfono"><input value={form.tel} onChange={set('tel')} placeholder="Teléfono" /></Field>
                <Field label="Email"><input value={form.email} onChange={set('email')} placeholder="Email" /></Field>
              </div>
              <Field label="Dirección"><input value={form.direccion} onChange={set('direccion')} placeholder="Dirección" /></Field>
              <div className="fr">
                <Field label="Fecha ingreso"><input type="date" value={form.fecha_ingreso} onChange={set('fecha_ingreso')} /></Field>
                <Field label="Puesto"><input value={form.puesto} onChange={set('puesto')} placeholder="Ej: Vendedor" /></Field>
              </div>
              <div className="fr">
                <Field label="Salario ($)"><input type="number" value={form.salario} onChange={set('salario')} min="0" placeholder="0" /></Field>
                <Field label="Obra social"><input value={form.obra_social} onChange={set('obra_social')} placeholder="Ej: OSECAC" /></Field>
              </div>
              <Field label="Sucursal">
                <select value={form.suc_id} onChange={set('suc_id')}>
                  <option value="">Sin sucursal</option>
                  {allSucs.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </Field>
              <Field label="Notas"><textarea value={form.notas} onChange={set('notas')} rows={2} style={{ fontSize: 12 }} placeholder="Notas internas..." /></Field>

              {/* Vincular a usuario existente */}
              <div style={{borderTop:'1px solid var(--bd)',paddingTop:10,marginTop:4}}>
                <Field label="Vincular a usuario">
                  <select value={form.vincular_usuario_id||''} onChange={set('vincular_usuario_id')}>
                    <option value="">Sin vínculo</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.nombre} ({u.usuario}){linkedUserIds.has(u.id) && u.id !== (modal?.usuario_id) ? ' ⚠️ ya vinculado' : ''}</option>
                    ))}
                  </select>
                </Field>
                {form.vincular_usuario_id && (() => {
                  const u = users.find(x => x.id === form.vincular_usuario_id)
                  return u ? <div style={{fontSize:11,color:'var(--mu)',marginTop:-4}}>👤 {u.nombre} · {u.email||'—'} · rol: {u.rol}</div> : null
                })()}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '⏳ Guardando...' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal pagar sueldo */}
      {sueldoModal && (
        <div className="modal-overlay" onClick={() => setSueldoModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>💵 Pagar sueldo — {sueldoModal.nombre} {sueldoModal.apellido || ''}</h3>
              <button type="button" className="modal-close" onClick={() => setSueldoModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label="Monto *"><input type="number" value={sueldoForm.monto} onChange={e => setSueldoForm(p => ({ ...p, monto: e.target.value }))} min="0" step="0.01" style={{ fontSize: 16, fontWeight: 700 }} /></Field>
              <div className="fr">
                <Field label="Fecha"><input type="date" value={sueldoForm.fecha} onChange={e => setSueldoForm(p => ({ ...p, fecha: e.target.value }))} /></Field>
                <Field label="Método">
                  <select value={sueldoForm.metodo} onChange={e => setSueldoForm(p => ({ ...p, metodo: e.target.value }))}>
                    <option value="efectivo">💵 Efectivo</option>
                    <option value="transferencia">🏦 Transferencia</option>
                    <option value="cheque">🧾 Cheque</option>
                  </select>
                </Field>
              </div>
              <div className="fr">
                <Field label="Fuente del dinero">
                  <select value={sueldoForm.fuente} onChange={e => setSueldoForm(p => ({ ...p, fuente: e.target.value }))}>
                    <option value="tesoreria">🏦 Tesorería</option>
                    <option value="cajon">💰 Cajón del día</option>
                  </select>
                </Field>
                {sueldoForm.fuente === 'cajon' ? (
                  <Field label="Sucursal">
                    <select value={sueldoForm.suc_id || ''} onChange={e => setSueldoForm(p => ({ ...p, suc_id: e.target.value }))}>
                      {allSucs.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </Field>
                ) : (
                  <Field label="Cuenta de tesorería">
                    <select value={sueldoForm.cuenta_id || ''} onChange={e => setSueldoForm(p => ({ ...p, cuenta_id: e.target.value }))}>
                      <option value="">Elegir cuenta...</option>
                      {cuentasTes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({fmt(c.saldo)})</option>)}
                    </select>
                  </Field>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--mu)' }}>Se registrará como gasto de categoría "Sueldos" y el egreso quedará en la fuente elegida.</div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setSueldoModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" style={{ background: 'var(--ok)' }} onClick={saveSueldo} disabled={sueldoSaving}>{sueldoSaving ? '⏳ Pagando...' : '✅ Pagar sueldo'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetalleEmpleado({ empleado, api, toast, onUpdate }) {
  const [ausencias, setAusencias] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAus, setModalAus] = useState(null)
  const [formAus, setFormAus] = useState({ tipo: 'otro', fecha_inicio: '', fecha_fin: '', motivo: '', certificado: false })
  const [saving, setSaving] = useState(false)

  const loadAus = useCallback(async () => {
    setLoading(true)
    try { setAusencias(await api('GET', '/rrhh/ausencias?empleado_id=' + empleado.id)) } catch { setAusencias([]) }
    finally { setLoading(false) }
  }, [api, empleado.id])

  useEffect(() => { if (empleado) loadAus() }, [loadAus, empleado])

  function openNuevaAus() { setFormAus({ tipo: 'otro', fecha_inicio: '', fecha_fin: '', motivo: '', certificado: false }); setModalAus('new') }

  async function saveAus() {
    if (!formAus.fecha_inicio) { toast('Fecha inicio requerida', 'err'); return }
    setSaving(true)
    try {
      await api('POST', '/rrhh/ausencias', { ...formAus, empleado_id: empleado.id })
      toast('Ausencia registrada', 'ok')
      setModalAus(null); loadAus()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function eliminarAus(id) {
    if (!window.confirm('Eliminar ausencia?')) return
    try { await api('DELETE', '/rrhh/ausencias/' + id); toast('Ausencia eliminada', 'ok'); loadAus() }
    catch (e) { toast(e.message, 'err') }
  }

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--sf)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>🏖️ Ausencias de {empleado.nombre} {empleado.apellido || ''}</div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openNuevaAus}>+ Nueva ausencia</button>
      </div>
      {loading ? <div className="spinner" style={{ margin: '0 auto' }} /> : ausencias.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--mu)', textAlign: 'center', padding: 8 }}>Sin ausencias registradas</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ausencias.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--bg)', fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>{(TIPOS_AUSENCIA.find(t => t.id === a.tipo) || {}).label || a.tipo}</span>
              <span>{new Date(a.fecha_inicio).toLocaleDateString('es-AR')}{a.fecha_fin ? ' → ' + new Date(a.fecha_fin).toLocaleDateString('es-AR') : ''}</span>
              {a.motivo && <span style={{ color: 'var(--mu)' }}>· {a.motivo}</span>}
              {a.certificado && <span className="badge badge-blue" style={{ fontSize: 9 }}>📄 Certificado</span>}
              <button type="button" onClick={() => eliminarAus(a.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bad)', fontSize: 12 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {modalAus && (
        <div className="modal-overlay" onClick={() => setModalAus(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Nueva ausencia</h3>
              <button type="button" className="modal-close" onClick={() => setModalAus(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label="Tipo">
                <select value={formAus.tipo} onChange={e => setFormAus(p => ({ ...p, tipo: e.target.value }))}>
                  {TIPOS_AUSENCIA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </Field>
              <div className="fr">
                <Field label="Fecha inicio"><input type="date" value={formAus.fecha_inicio} onChange={e => setFormAus(p => ({ ...p, fecha_inicio: e.target.value }))} /></Field>
                <Field label="Fecha fin"><input type="date" value={formAus.fecha_fin} onChange={e => setFormAus(p => ({ ...p, fecha_fin: e.target.value }))} /></Field>
              </div>
              <Field label="Motivo"><input value={formAus.motivo} onChange={e => setFormAus(p => ({ ...p, motivo: e.target.value }))} placeholder="Opcional" /></Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={formAus.certificado} onChange={e => setFormAus(p => ({ ...p, certificado: e.target.checked }))} style={{ width: 16, height: 16 }} />
                📄 Con certificado médico
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setModalAus(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={saveAus} disabled={saving}>{saving ? '⏳ Guardando...' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AusenciasTab({ api, toast }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setList(await api('GET', '/rrhh/ausencias')) } catch { setList([]) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  if (loading) return <Loader />

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 12 }}>{list.length} ausencia{list.length !== 1 ? 's' : ''} registradas</div>
      {list.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--mu)', fontSize: 13 }}>Sin ausencias registradas</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{a.emp_nombre || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 1 }}>
                  {(TIPOS_AUSENCIA.find(t => t.id === a.tipo) || {}).label || a.tipo} · {new Date(a.fecha_inicio).toLocaleDateString('es-AR')}{a.fecha_fin ? ' → ' + new Date(a.fecha_fin).toLocaleDateString('es-AR') : ''}
                  {a.motivo && <> · {a.motivo}</>}
                </div>
              </div>
              {a.certificado ? <span className="badge badge-blue" style={{ fontSize: 10 }}>📄 Certificado</span> : <span className="badge badge-gray" style={{ fontSize: 10 }}>Sin certificado</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RRHH() {
  const { api } = useApi()
  const { toast } = useToast()
  const { allSucs } = useApp()
  const [tab, setTab] = useState('empleados')

  return (
    <div>
      <PageHeader title="👥 RRHH" subtitle="Gestión de empleados y ausencias" />
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--bd)', paddingBottom: 8 }}>
        <button type="button" className={`btn btn-sm ${tab === 'empleados' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('empleados')}>👥 Empleados</button>
        <button type="button" className={`btn btn-sm ${tab === 'ausencias' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('ausencias')}>🏖️ Ausencias</button>
      </div>
      <div className="card" style={{ maxWidth: 720 }}>
        {tab === 'empleados' && <EmpleadosTab api={api} toast={toast} allSucs={allSucs} />}
        {tab === 'ausencias' && <AusenciasTab api={api} toast={toast} />}
      </div>
    </div>
  )
}

