import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useApp, useToast, useAuth } from '../store'
import { Modal } from '../components/Modal'
import { SearchBar, PageHeader, Field, ConfirmDialog, EmptyRow, Loader, Pagination } from '../components/UI'
import { exportExcel, importExcel, pickFile } from '../utils/excel'

const PER_PAGE = 25
const EMPTY = { nombre: '', apellido: '', tel: '', email: '', dni: '', dir: '', notas: '', es_ctacte: false, limite_ctacte: '', lista: 1, suc_id: '' }

function Badge({ estado }) {
  const map = {
    activo: 'badge-green', inactivo: 'badge-gray',
    vip: 'badge-purple', deudor: 'badge-red',
  }
  return <span className={`badge ${map[estado] || 'badge-gray'}`}>{estado || 'activo'}</span>
}

function ClienteForm({ form, setForm }) {
  const { allSucs } = useApp()
  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }))
  const check = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.checked }))

  return (
    <>
      <div className="fr">
        <Field label="Nombre" required><input value={form.nombre} onChange={set('nombre')} placeholder="Nombre" /></Field>
        <Field label="Apellido"><input value={form.apellido} onChange={set('apellido')} placeholder="Apellido" /></Field>
      </div>
      <div className="fr">
        <Field label="Teléfono"><input value={form.tel} onChange={set('tel')} placeholder="Ej: 11-1234-5678" /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={set('email')} placeholder="mail@ejemplo.com" /></Field>
      </div>
      <div className="fr">
        <Field label="DNI / CUIT"><input value={form.dni} onChange={set('dni')} placeholder="Número de documento" /></Field>
        <Field label="Dirección"><input value={form.dir} onChange={set('dir')} placeholder="Calle y número" /></Field>
      </div>
      <div className="fr">
        <Field label="Lista de precios">
          <select value={form.lista || 1} onChange={set('lista')}>
            <option value={1}>Lista 1 (precio base)</option>
            <option value={2}>Lista 2 (precio mayorista)</option>
            <option value={3}>Lista 3 (precio especial)</option>
          </select>
        </Field>
        <Field label="Sucursal de origen">
          <select value={form.suc_id || ''} onChange={set('suc_id')}>
            <option value="">Sin asignar</option>
            {allSucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notas">
        <textarea value={form.notas} onChange={set('notas')} rows={2} placeholder="Observaciones opcionales" style={{ resize: 'vertical' }} />
      </Field>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px', background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)' }}>
        <input type="checkbox" id="es-ctacte" checked={!!form.es_ctacte} onChange={check('es_ctacte')} style={{ width: 16, height: 16 }} />
        <label htmlFor="es-ctacte" style={{ cursor: 'pointer', fontSize: 13, textTransform: 'none', letterSpacing: 0, color: 'var(--tx)', fontWeight: 500, margin: 0 }}>
          Habilitado para cuenta corriente
        </label>
        {form.es_ctacte && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--mu)', textTransform: 'none', margin: 0 }}>Límite $</label>
            <input value={form.limite_ctacte} onChange={set('limite_ctacte')} type="number" placeholder="Sin límite" style={{ width: 100 }} />
          </div>
        )}
      </div>
    </>
  )
}

// ── Modal Ajuste Puntos ──
function ModalAjustePuntos({ open, onClose, cliente, onSave }) {
  const [tipo, setTipo] = useState('suma')
  const [puntos, setPuntos] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  async function guardar() {
    const pts = parseInt(puntos)
    if (!pts || pts <= 0) { toast('Ingresá una cantidad válida', 'err'); return }
    if (tipo !== 'suma' && pts > (cliente.puntos || 0)) { toast('El cliente no tiene tantos puntos', 'err'); return }
    setSaving(true)
    try {
      await onSave(cliente.id, { tipo, puntos: pts, motivo: motivo || tipo })
      toast('✅ Puntos actualizados', 'ok')
      onClose()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  const acciones = [
    { id: 'suma', label: '➕ Sumar', color: 'var(--ok)' },
    { id: 'resta', label: '➖ Restar', color: 'var(--bad)' },
    { id: 'canje', label: '🎁 Canjear', color: 'var(--warn)' },
  ]

  return (
    <Modal open={open} onClose={onClose} title={`⭐ Ajustar puntos — ${cliente?.nombre || ''}`} size="sm"
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : '💾 Aplicar'}</button></>}>
      <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--mu)' }}>Puntos actuales</span>
        <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--warn)' }}>{cliente?.puntos || 0} pts</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {acciones.map(a => (
          <button type="button" key={a.id} className={`btn btn-sm ${tipo === a.id ? 'btn-primary' : 'btn-secondary'}`}
            style={tipo === a.id ? { background: a.color, borderColor: a.color } : {}}
            onClick={() => setTipo(a.id)}>{a.label}</button>
        ))}
      </div>
      <Field label="Cantidad de puntos">
        <input type="number" value={puntos} onChange={e => setPuntos(e.target.value)}
          min="1" placeholder="Ej: 100" style={{ fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
      </Field>
      <Field label="Motivo">
        <input value={motivo} onChange={e => setMotivo(e.target.value)}
          placeholder={tipo === 'suma' ? 'Ej: Compra #1234' : tipo === 'canje' ? 'Ej: Producto canjeado' : 'Ej: Ajuste manual'} />
      </Field>
      {tipo !== 'suma' && (
        <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 8, padding: 8, background: 'rgba(245,158,11,.08)', borderRadius: 6 }}>
          ⚠️ Después de aplicar, quedarán <strong>{Math.max(0, (cliente?.puntos || 0) - parseInt(puntos||0))} pts</strong>
        </div>
      )}
    </Modal>
  )
}

// ── ClienteSelect ──
function ClienteSelect({ value, onChange, search, setSearch, label, clientes }) {
  const list = search ? clientes.filter(c =>
    !c.activo === false &&
    (c.nombre + ' ' + (c.apellido||'') + ' ' + (c.dni||'') + ' ' + (c.tel||'')).toLowerCase().includes(search.toLowerCase())
  ) : []
  return (
    <Field label={label}>
      <input type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Buscar cliente..." style={{ marginBottom: 4 }} />
      {value && <div style={{ padding: '6px 10px', background: 'var(--sf)', borderRadius: 6, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        {clientes.find(c => c.id === value)?.nombre || ''} {clientes.find(c => c.id === value)?.apellido || ''}
      </div>}
      {search && list.length > 0 && (
        <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--bd)', borderRadius: 6 }}>
          {list.slice(0, 10).map(c => (
            <div key={c.id} onClick={() => { onChange(c.id); setSearch('') }}
              style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--bd)' }}>
              {c.nombre} {c.apellido || ''} {c.dni ? `· ${c.dni}` : ''}
            </div>
          ))}
        </div>
      )}
    </Field>
  )
}

// ── Modal Merge Clientes ──
function ModalMerge({ open, onClose, clientes, onMerge }) {
  const [origen, setOrigen] = useState('')
  const [destino, setDestino] = useState('')
  const [saving, setSaving] = useState(false)
  const [searchO, setSearchO] = useState('')
  const [searchD, setSearchD] = useState('')
  const { toast } = useToast()

  const origenCli = clientes.find(c => c.id === origen)
  const destinoCli = clientes.find(c => c.id === destino)

  useEffect(() => {
    setOrigen(''); setDestino(''); setSearchO(''); setSearchD('')
  }, [])

  async function confirmar() {
    if (!origen || !destino) { toast('Seleccioná ambos clientes', 'err'); return }
    if (origen === destino) { toast('Deben ser clientes diferentes', 'err'); return }
    setSaving(true)
    try {
      await onMerge(origen, destino)
      toast('✅ Clientes fusionados', 'ok')
      onClose()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="🔀 Fusionar clientes duplicados" size="md"
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-danger" onClick={confirmar} disabled={saving || !origen || !destino}>
          {saving ? 'Fusionando...' : '🔀 Fusionar'}
        </button></>}>
      <p style={{ fontSize: 13, color: 'var(--mu)', marginBottom: 14 }}>
        Todos los datos del cliente <strong>origen</strong> (ventas, ctacte, pedidos, puntos) pasarán al <strong>destino</strong>. El origen se dará de baja.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ClienteSelect value={origen} onChange={setOrigen} search={searchO} setSearch={setSearchO} label="📤 Cliente origen" clientes={clientes} />
        <ClienteSelect value={destino} onChange={setDestino} search={searchD} setSearch={setSearchD} label="📥 Cliente destino" clientes={clientes} />
      </div>
      {origenCli && destinoCli && (
        <div style={{ marginTop: 14, padding: 10, background: 'rgba(239,68,68,.06)', borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Resumen:</div>
          <div>📤 {origenCli.nombre} (puntos: {origenCli.puntos||0}, compras: {origenCli.compras||0})</div>
          <div style={{ fontWeight: 700, color: 'var(--bad)' }}>→</div>
          <div>📥 {destinoCli.nombre} (puntos: {destinoCli.puntos||0}, compras: {destinoCli.compras||0})</div>
        </div>
      )}
    </Modal>
  )
}

export function Clientes() {
  const { api } = useApi()
  const { toast } = useToast()
  const { me } = useAuth()
  const navigate = useNavigate()

  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroCtacte, setFiltroCtacte] = useState('')
  const [filtroLista, setFiltroLista] = useState('')
  const [sortBy, setSortBy] = useState('nombre')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)   // null | 'new' | {cliente}
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [modalMerge, setModalMerge] = useState(false)
  const [modalPuntos, setModalPuntos] = useState(null)  // cliente para ajuste puntos
  const [ficha, setFicha] = useState(null)      // cliente para ficha
  const [fichaData, setFichaData] = useState(null)
  const [fichaLoading, setFichaLoading] = useState(false)
  const [fichaTab, setFichaTab] = useState('historial')

  const load = useCallback(async () => {
    try {
      const data = await api('GET', '/clientes')
      setClientes(Array.isArray(data) ? data : [])
    } catch { toast('Error cargando clientes', 'err') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Filters + pagination
  const filtered = useMemo(() => {
    let list = clientes.filter((c) => c.activo !== false)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((c) =>
        (c.nombre + ' ' + (c.apellido || '') + ' ' + (c.tel || '') + ' ' + (c.dni || '') + ' ' + (c.email || '')).toLowerCase().includes(q)
      )
    }
    if (filtroCtacte === 'ctacte') list = list.filter((c) => c.es_ctacte)
    if (filtroCtacte === 'deudor') list = list.filter((c) => c.saldo_ctacte > 0)
    if (filtroLista) list = list.filter((c) => String(c.lista || 1) === filtroLista)

    const sorted = [...list]
    switch (sortBy) {
      case 'gastado': sorted.sort((a, b) => (b.total_gastado || 0) - (a.total_gastado || 0)); break
      case 'puntos': sorted.sort((a, b) => (b.puntos || 0) - (a.puntos || 0)); break
      case 'recientes': sorted.sort((a, b) => (b.creado || '').localeCompare(a.creado || '')); break
      default: sorted.sort((a, b) => ((a.nombre || '') + (a.apellido || '')).localeCompare((b.nombre || '') + (b.apellido || '')))
    }
    return sorted
  }, [clientes, search, filtroCtacte, filtroLista, sortBy])

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  function exportar() {
    const headers = ['Nombre', 'Apellido', 'DNI', 'Tel', 'Email', 'Dirección', 'Lista', 'CtaCte', 'Saldo CtaCte', 'Puntos', 'Total gastado', 'N° compras', 'Notas']
    const rows = filtered.map(c => [
      c.nombre, c.apellido || '', c.dni || '', c.tel || '', c.email || '', c.dir || '',
      'Lista ' + (c.lista || 1), c.es_ctacte ? 'Sí' : 'No', c.saldo_ctacte || 0,
      c.puntos || 0, c.total_gastado || 0, c.n_ventas || 0, c.notas || ''
    ])
    exportExcel('clientes', headers, rows, 'Clientes')
    toast('📊 Excel exportado', 'ok')
  }

  async function importar() {
    try {
      const file = await pickFile()
      setImporting(true)
      const rows = await importExcel(file)
      if (!rows.length) { toast('Archivo vacío', 'err'); return }
      let creados = 0, actualizados = 0, errores = 0
      for (const r of rows) {
        try {
          const nombre = r['Nombre'] || r['nombre']
          if (!nombre) { errores++; continue }
          const tel = r['Tel'] || r['tel'] || r['Teléfono'] || ''
          const dni = r['DNI'] || r['dni'] || ''
          const existing = (dni && clientes.find(c => c.dni === dni)) || (tel && clientes.find(c => c.tel === tel)) || null
          const data = {
            nombre: String(nombre).trim(),
            apellido: r['Apellido'] || r['apellido'] || '',
            dni: String(dni || '').trim(),
            tel: String(tel || '').trim(),
            email: r['Email'] || r['email'] || '',
            dir: r['Dirección'] || r['direccion'] || r['dir'] || '',
            lista: parseInt(String(r['Lista'] || r['lista'] || '1').replace(/\D/g, '')) || 1,
            es_ctacte: String(r['CtaCte'] || r['ctacte'] || '').toLowerCase() === 'sí' || String(r['CtaCte'] || '').toLowerCase() === 'si',
            notas: r['Notas'] || r['notas'] || '',
          }
          if (existing) { await api('PUT', '/clientes/' + existing.id, data); actualizados++ }
          else { await api('POST', '/clientes', data); creados++ }
        } catch { errores++ }
      }
      toast(`📥 ${creados} creados, ${actualizados} actualizados${errores ? ', ' + errores + ' errores' : ''}`, 'ok')
      load()
    } catch (e) {
      if (e.message !== 'Sin archivo') toast('Error: ' + e.message, 'err')
    } finally { setImporting(false) }
  }

  async function openFicha(cli) {
    setFicha(cli); setFichaData(null); setFichaLoading(true); setFichaTab('historial')
    try {
      const [stats, hist, ctacte, puntosMovs] = await Promise.all([
        api('GET', '/clientes/' + cli.id + '/stats').catch(() => ({})),
        api('GET', '/clientes/' + cli.id + '/historial').catch(() => []),
        api('GET', '/ctacte?cli_id=' + cli.id).catch(() => null),
        api('GET', '/clientes/' + cli.id + '/puntos').catch(() => ({ puntos: 0, movimientos: [] })),
      ])
      setFichaData({ stats, hist: Array.isArray(hist) ? hist : [], ctacte, puntosMovs: Array.isArray(puntosMovs?.movimientos) ? puntosMovs.movimientos : [] })
    } catch { setFichaData({ stats: {}, hist: [], ctacte: null, puntosMovs: [] }) }
    finally { setFichaLoading(false) }
  }

  function openNew() {
    setForm(EMPTY)
    setModal('new')
  }
  function openEdit(c) {
    setForm({
      nombre: c.nombre || '', apellido: c.apellido || '', tel: c.tel || '',
      email: c.email || '', dni: c.dni || '', dir: c.dir || '', notas: c.notas || '',
      es_ctacte: !!c.es_ctacte, limite_ctacte: c.limite_ctacte || '',
      lista: c.lista || 1, suc_id: c.suc_id || '',
    })
    setModal(c)
  }

  async function save() {
    if (!form.nombre.trim()) { toast('El nombre es obligatorio', 'err'); return }
    setSaving(true)
    try {
      const body = {
        ...form,
        es_ctacte: !!form.es_ctacte,
        limite_ctacte: form.limite_ctacte ? parseFloat(form.limite_ctacte) : null,
      }
      if (modal === 'new') {
        await api('POST', '/clientes', body)
        toast('Cliente creado', 'ok')
      } else {
        await api('PUT', '/clientes/' + modal.id, body)
        toast('Cliente actualizado', 'ok')
      }
      setModal(null)
      load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function deleteCliente(id) {
    try {
      await api('DELETE', '/clientes/' + id)
      toast('Cliente eliminado', 'ok')
      load()
    } catch (e) { toast(e.message, 'err') }
  }

  async function mergeClientes(origen, destino) {
    const r = await api('POST', '/clientes/merge', { origen_id: origen, destino_id: destino })
    load()
    if (ficha?.id === origen) setFicha(null)
    return r
  }

  async function guardarPuntos(cliId, data) {
    const r = await api('POST', '/clientes/' + cliId + '/puntos', data)
    load()
    // Refresh ficha data if open
    if (ficha?.id === cliId) {
      try {
        const [puntosMovs, stats] = await Promise.all([
          api('GET', '/clientes/' + cliId + '/puntos').catch(() => ({ movimientos: [] })),
          api('GET', '/clientes/' + cliId + '/stats').catch(() => ({})),
        ])
        setFichaData(p => ({ ...p, puntosMovs: Array.isArray(puntosMovs?.movimientos) ? puntosMovs.movimientos : [], stats }))
        setFicha(p => ({ ...p, puntos: r.puntos }))
      } catch {}
    }
    return r
  }

  const selStyle = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', cursor: 'pointer', fontSize: 13, background: 'var(--bg)', color: 'var(--tx)' }
  const fmt = (n) => n != null ? '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '—'

  if (loading) return <Loader />

  return (
    <div>
      <PageHeader title={`👥 Clientes (${filtered.length})`}>
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Nombre, tel, DNI..." style={{ width: 220 }} />
        <select style={selStyle} value={filtroLista} onChange={(e) => { setFiltroLista(e.target.value); setPage(1) }} title="Lista de precios">
          <option value="">Todas las listas</option>
          <option value="1">Lista 1</option>
          <option value="2">Lista 2</option>
          <option value="3">Lista 3</option>
        </select>
        <select style={selStyle} value={sortBy} onChange={(e) => setSortBy(e.target.value)} title="Ordenar">
          <option value="nombre">A → Z</option>
          <option value="gastado">Más gastado</option>
          <option value="puntos">Más puntos</option>
          <option value="recientes">Más recientes</option>
        </select>
        <select className="btn btn-secondary" style={{ padding: '9px 12px', cursor: 'pointer' }} value={filtroCtacte} onChange={(e) => { setFiltroCtacte(e.target.value); setPage(1) }}>
          <option value="">Todos</option>
          <option value="ctacte">Con cta. corriente</option>
          <option value="deudor">Con deuda</option>
        </select>
        <button type="button" className="btn btn-secondary btn-sm" onClick={exportar}>📊 Excel</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={importar} disabled={importing}>📥 Importar</button>
        {['admin','supervisor'].includes(me?.rol) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalMerge(true)}>🔀 Merge</button>}
        <button type="button" className="btn btn-primary" onClick={openNew}>+ Nuevo cliente</button>
      </PageHeader>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>DNI / CUIT</th>
                <th>Puntos</th>
                <th>Cta. Cte.</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0
                ? <EmptyRow cols={6} icon="👥" text={search ? 'Sin resultados para tu búsqueda' : 'Sin clientes aún. Creá el primero con "+ Nuevo cliente"'} />
                : paginated.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(c)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.nombre} {c.apellido}</div>
                      {c.email && <div style={{ fontSize: 11, color: 'var(--mu)' }}>{c.email}</div>}
                    </td>
                    <td>{c.tel || '—'}</td>
                    <td style={{ fontSize: 12 }}>{c.dni || '—'}</td>
                    <td>{c.puntos || 0} pts</td>
                    <td>
                      {c.es_ctacte
                        ? <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span className={`badge ${c.saldo_ctacte > 0 ? 'badge-red' : 'badge-green'}`}>
                              {c.saldo_ctacte > 0 ? `Debe ${fmt(c.saldo_ctacte)}` : 'Al día'}
                            </span>
                          </span>
                        : <span className="badge badge-gray">No</span>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-icon btn-sm" title="Ver ficha" onClick={() => openFicha(c)}>👁</button>
                        <button type="button" className="btn btn-icon btn-sm" title="Historial ventas" onClick={() => navigate('/app/ventas?cli_id=' + c.id)}>📋</button>
                        <button type="button" className="btn btn-icon btn-sm" title="Eliminar" onClick={() => setConfirm(c.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 16px' }}>
          <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
        </div>
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'new' ? '+ Nuevo cliente' : `Editar: ${modal?.nombre} ${modal?.apellido || ''}`}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : '💾 Guardar'}
            </button>
          </>
        }
      >
        <ClienteForm form={form} setForm={setForm} />
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => deleteCliente(confirm)}
        title="Eliminar cliente"
        message="¿Eliminás este cliente? Esta acción no se puede deshacer."
        confirmLabel="Sí, eliminar"
      />

      {/* Merge modal */}
      <ModalMerge
        key={modalMerge ? 'merge-open' : 'merge-closed'}
        open={modalMerge}
        onClose={() => setModalMerge(false)}
        clientes={clientes}
        onMerge={mergeClientes}
      />

      {/* Ajuste puntos modal */}
      <ModalAjustePuntos
        key={modalPuntos?.id || 'puntos-closed'}
        open={!!modalPuntos}
        onClose={() => setModalPuntos(null)}
        cliente={modalPuntos}
        onSave={guardarPuntos}
      />

      {/* Ficha cliente */}
      {ficha && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setFicha(null) }}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h3>📋 {ficha.nombre} {ficha.apellido || ''}</h3>
              <button type="button" onClick={() => setFicha(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--mu)' }}>×</button>
            </div>
            <div className="modal-body">
              {fichaLoading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" /></div> : fichaData && (
                <>
                  {/* Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginBottom: 14 }}>
                    {[
                      { label: 'Total comprado', value: fmt(fichaData.stats.total_compras || 0), color: 'var(--ac)' },
                      { label: 'N° compras', value: fichaData.stats.n_ventas || 0 },
                      { label: 'Ticket promedio', value: fmt(fichaData.stats.ticket_prom || 0) },
                      { label: '⭐ Puntos', value: fichaData.stats.puntos || ficha.puntos || 0, color: 'var(--warn)' },
                    ].map((k) => (
                      <div key={k.label} style={{ background: 'var(--sf)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase' }}>{k.label}</div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: k.color }}>{k.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* CtaCte saldo */}
                  {fichaData.ctacte?.saldo > 0 && (
                    <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid var(--bad)', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 13 }}>
                      📒 Saldo cuenta corriente: <strong style={{ color: 'var(--bad)' }}>{fmt(fichaData.ctacte.saldo)}</strong>
                    </div>
                  )}

                  {/* Contact info */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 12, color: 'var(--mu)' }}>
                    {ficha.tel && <span>📱 {ficha.tel}</span>}
                    {ficha.email && <span>✉️ {ficha.email}</span>}
                    {ficha.dni && <span>🪪 {ficha.dni}</span>}
                    {ficha.dir && <span>📍 {ficha.dir}</span>}
                    <span>📋 Lista {ficha.lista || 1}</span>
                    {ficha.es_ctacte && <span className="badge badge-blue">Cta. Corriente</span>}
                  </div>

                  {/* Tabs */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 10, borderBottom: '2px solid var(--bd)', paddingBottom: 6, flexWrap: 'wrap' }}>
                    {[
                      ['historial', `🛍 Historial (${fichaData.hist.length})`],
                      ['puntos', `⭐ Puntos`],
                      ['ctacte', '📒 Cta Cte'],
                      ['seguimiento', '📝 Seguimiento'],
                      ['notas', '📋 Notas'],
                    ].map(([key, label]) => (
                      <button type="button" key={key} className={`btn btn-sm ${fichaTab === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFichaTab(key)}>{label}</button>
                    ))}
                  </div>

                  {fichaTab === 'historial' && (
                    fichaData.hist.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 24, color: 'var(--mu)' }}>Sin compras registradas</div>
                    ) : (
                      <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
                        <table>
                          <thead><tr><th>Fecha</th><th>Sucursal</th><th>Productos</th><th style={{ textAlign: 'right' }}>Total</th><th>Estado</th></tr></thead>
                          <tbody>
                            {fichaData.hist.map((v, i) => (
                              <tr key={i}>
                                <td style={{ fontSize: 11 }}>{new Date(v.fecha).toLocaleDateString('es-AR')}</td>
                                <td style={{ fontSize: 11 }}>{v.suc_nombre || '—'}</td>
                                <td style={{ fontSize: 11, color: 'var(--mu)' }}>{(v.items || []).slice(0, 2).map(it => it.nombre + ' x' + it.cantidad).join(', ')}{(v.items || []).length > 2 ? '...' : ''}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ac)' }}>{fmt(v.total)}</td>
                                <td><span className={`badge ${v.anulada ? 'badge-red' : 'badge-green'}`}>{v.anulada ? 'Anulada' : 'OK'}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}

                  {fichaTab === 'puntos' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontSize: 13, color: 'var(--mu)' }}>
                          Saldo: <strong style={{ fontSize: 20, color: 'var(--warn)' }}>{ficha.puntos || fichaData.stats.puntos || 0} pts</strong>
                        </div>
                        <button type="button" className="btn btn-sm" style={{ background: 'var(--warn)', color: '#fff', border: 'none' }}
                          onClick={() => setModalPuntos(ficha)}>
                          ⭐ Gestionar puntos
                        </button>
                      </div>
                      {fichaData.puntosMovs && fichaData.puntosMovs.length > 0 ? (
                        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                          {fichaData.puntosMovs.map((m, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--bd)', fontSize: 12 }}>
                              <div>
                                <span className={`badge ${m.tipo === 'suma' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 9 }}>
                                  {m.tipo === 'suma' ? '+ Suma' : m.tipo === 'canje' ? '🎁 Canje' : '− Resta'}
                                </span>
                                <span style={{ marginLeft: 6, color: 'var(--mu)' }}>{m.motivo || ''}</span>
                              </div>
                              <div>
                                <span style={{ fontWeight: 700, color: m.puntos > 0 ? 'var(--ok)' : 'var(--bad)', marginRight: 10 }}>
                                  {m.puntos > 0 ? '+' : ''}{m.puntos} pts
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--mu)' }}>{new Date(m.fecha).toLocaleDateString('es-AR')}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--mu)', fontSize: 13 }}>Sin movimientos de puntos</div>
                      )}
                    </div>
                  )}

                  {fichaTab === 'ctacte' && (
                    <div>
                      {fichaData.ctacte ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                            <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: 'var(--mu)' }}>Saldo actual</div>
                              <div style={{ fontWeight: 800, fontSize: 18, color: fichaData.ctacte.saldo > 0 ? 'var(--bad)' : 'var(--ok)' }}>
                                {fmt(fichaData.ctacte.saldo || 0)}
                              </div>
                            </div>
                            <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: 'var(--mu)' }}>Límite</div>
                              <div style={{ fontWeight: 800, fontSize: 18 }}>{ficha.limite_ctacte ? fmt(ficha.limite_ctacte) : 'Sin límite'}</div>
                            </div>
                          </div>
                          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                            {(fichaData.ctacte.movimientos || []).length === 0 ? (
                              <div style={{ textAlign: 'center', padding: 20, color: 'var(--mu)', fontSize: 13 }}>Sin movimientos</div>
                            ) : fichaData.ctacte.movimientos.slice(0, 30).map((m, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--bd)', fontSize: 12 }}>
                                <div>
                                  <span className={`badge ${m.tipo === 'pago' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 9 }}>
                                    {m.tipo === 'pago' ? 'Pago' : 'Deuda'}
                                  </span>
                                  <span style={{ marginLeft: 6, color: 'var(--mu)' }}>{m.descripcion || m.concepto || ''}</span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontWeight: 700, color: m.tipo === 'pago' ? 'var(--ok)' : 'var(--bad)' }}>
                                    {m.tipo === 'pago' ? '−' : '+'}{fmt(m.monto || 0)}
                                  </div>
                                  <div style={{ fontSize: 9, color: 'var(--mu)' }}>{new Date(m.fecha).toLocaleDateString('es-AR')}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--mu)', fontSize: 13 }}>
                          {ficha.es_ctacte ? 'Error cargando datos' : 'Cliente sin cuenta corriente'}
                        </div>
                      )}
                    </div>
                  )}

                  {fichaTab === 'seguimiento' && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <input id="seguimiento-input" type="text" placeholder="Agregar seguimiento..." style={{ flex: 1 }}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              try {
                                await api('POST', '/pipeline/seguimiento', {
                                  cliente_id: ficha.id, accion: 'contacto', nota: e.target.value,
                                  fecha: new Date().toISOString(), usuario: me?.nombre || ''
                                })
                                toast('✅ Seguimiento agregado', 'ok')
                                e.target.value = ''
                              } catch { toast('Error al guardar', 'err') }
                            }
                          }} />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--mu)', textAlign: 'center', padding: 16 }}>
                        Presioná Enter para guardar. Los seguimientos se muestran en el Pipeline.
                      </div>
                    </div>
                  )}

                  {fichaTab === 'notas' && (
                    <div>
                      <textarea defaultValue={ficha.notas || ''} rows={4} style={{ width: '100%', resize: 'vertical' }} placeholder="Notas sobre el cliente..." onChange={(e) => {
                        api('PUT', '/clientes/' + ficha.id, { notas: e.target.value }).catch(() => {})
                      }} />
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => openEdit(ficha)}>✏️ Editar</button>
              <button type="button" className="btn btn-secondary" onClick={() => setFicha(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

