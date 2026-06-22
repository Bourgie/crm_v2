import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useApi } from '../hooks/useApi'
import { useAuth, useApp, useToast } from '../store'
import { Modal } from '../components/Modal'
import { Field, Loader } from '../components/UI'
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'

const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

export const pipelineVencidas = { count: 0, listeners: [] }
export function usePipelineVencidas() {
  const [n, setN] = useState(pipelineVencidas.count)
  useEffect(() => {
    pipelineVencidas.listeners.push(setN)
    return () => { pipelineVencidas.listeners = pipelineVencidas.listeners.filter(l => l !== setN) }
  }, [])
  return n
}

export const tareasVencidas = { count: 0, listeners: [] }
export function useTareasVencidas() {
  const [n, setN] = useState(tareasVencidas.count)
  useEffect(() => {
    tareasVencidas.listeners.push(setN)
    return () => { tareasVencidas.listeners = tareasVencidas.listeners.filter(l => l !== setN) }
  }, [])
  return n
}

export const pipelineActivity = { count: 0, data: [], listeners: [] }
export function usePipelineActivity() {
  const [n, setN] = useState(pipelineActivity.count)
  useEffect(() => {
    pipelineActivity.listeners.push(setN)
    return () => { pipelineActivity.listeners = pipelineActivity.listeners.filter(l => l !== setN) }
  }, [])
  return n
}

function InlineEdit({ value, type, onSave, children, style }) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')
  const ref = useRef(null)

  function startEdit(e) {
    e.stopPropagation()
    setEditVal(String(value ?? ''))
    setEditing(true)
    setTimeout(() => ref.current?.select?.(), 50)
  }

  function save() {
    if (editVal !== String(value ?? '')) onSave(editVal)
    setEditing(false)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <input ref={ref} type={type} value={editVal}
        onChange={e => setEditVal(e.target.value)} onBlur={save} onKeyDown={onKeyDown}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', padding: '2px 4px', borderRadius: 4, border: '1.5px solid var(--ac)', fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit', background: 'var(--bg)', boxSizing: 'border-box', ...style }}
        autoFocus />
    )
  }

  return <span onClick={startEdit} style={{ cursor: 'pointer', borderRadius: 4, ...style }}>{children}</span>
}

function DraggableCard({ op, etapas, etapaActual, onMover, onClick, onInlineSave, isSupervisor }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: op.id, data: { etapa_id: op.etapa_id } })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      onClick={() => onClick?.(op)}
      style={{
        background: 'var(--bg)', border: `1.5px solid ${isDragging ? 'var(--ac)' : 'var(--bd)'}`,
        borderRadius: 10, padding: '10px 12px', cursor: 'grab', transition: isDragging ? 'none' : 'all .1s',
        opacity: isDragging ? 0.4 : 1, touchAction: 'none',
        ...style
      }}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.borderColor = 'var(--ac)' }}
      onMouseLeave={e => { if (!isDragging) e.currentTarget.style.borderColor = 'var(--bd)' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{op.nombre}</div>
      {op.cli_nombre && <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 4 }}>👤 {op.cli_nombre}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <InlineEdit value={op.valor_estimado} type="number" onSave={v => onInlineSave(op.id, { valor_estimado: parseFloat(v) || 0 })} style={{ fontSize: 14, fontWeight: 700, color: 'var(--ok)' }}>
          {fmt(op.valor_estimado)}
        </InlineEdit>
        <InlineEdit value={op.probabilidad} type="number" onSave={v => onInlineSave(op.id, { probabilidad: Math.min(100, Math.max(0, parseInt(v) || 0)) })} style={{ fontSize: 11, color: 'var(--mu)', textAlign: 'right' }}>
          {op.probabilidad}%
        </InlineEdit>
      </div>
      {(op.usuario_nombre || op.vend_nombre) && <div style={{ fontSize: 10, color: 'var(--mu)', marginTop: 4 }}>👤 {op.usuario_nombre || op.vend_nombre}</div>}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
        {op.proximo_contacto ? (
          <InlineEdit value={op.proximo_contacto?.substr(0, 10)} type="date" onSave={v => onInlineSave(op.id, { proximo_contacto: v || null })} style={{ fontSize: 10 }}>
            <span style={{ color: new Date(op.proximo_contacto) < new Date() ? 'var(--bad)' : 'var(--ac)' }}>
              📞 {new Date(op.proximo_contacto).toLocaleDateString('es-AR')}
            </span>
          </InlineEdit>
        ) : (
          <InlineEdit value="" type="date" onSave={v => onInlineSave(op.id, { proximo_contacto: v || null })} style={{ fontSize: 10 }}>
            <span style={{ color: 'var(--mu)', cursor: 'pointer' }}>📞 + agregar contacto</span>
          </InlineEdit>
        )}
        {op.fecha_cierre_estimada && (
          <InlineEdit value={op.fecha_cierre_estimada?.substr(0, 10)} type="date" onSave={v => onInlineSave(op.id, { fecha_cierre_estimada: v || null })} style={{ fontSize: 10 }}>
            <span style={{ color: new Date(op.fecha_cierre_estimada) < new Date() ? 'var(--bad)' : 'var(--mu)' }}>
              📅 {new Date(op.fecha_cierre_estimada).toLocaleDateString('es-AR')}
            </span>
          </InlineEdit>
        )}
      </div>
      {op.observacion && (
        <div style={{ fontSize: 11, color: 'var(--ac)', marginTop: 4, fontStyle: 'italic', background: 'var(--sf)', borderRadius: 6, padding: '4px 6px' }}>
          💬 {op.observacion}
        </div>
      )}
      {op.estado === 'archivado' && <div style={{ fontSize: 10, color: 'var(--mu)', marginTop: 2 }}>📦 Archivado</div>}
      <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
        <select value="" onChange={e => { if (e.target.value) onMover(op.id, e.target.value); e.target.value = '' }}
          style={{ width: '100%', fontSize: 10, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--sf)', color: 'var(--tx)', cursor: 'pointer' }}>
          <option value="">→ Mover a...</option>
          {etapas.filter(e => e.id !== etapaActual.id).map(e => (
            <option key={e.id} value={e.id}>→ {e.nombre}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function DroppableColumn({ id, children, style }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} style={{ minWidth: 260, maxWidth: 300, flex: 1, background: isOver ? 'rgba(99,102,241,0.05)' : 'var(--sf)', borderRadius: 12, border: `1.5px solid ${isOver ? 'var(--ac)' : 'var(--bd)'}`, display: 'flex', flexDirection: 'column', transition: 'all .1s', ...style }}>
      {children}
    </div>
  )
}

function ReportsPanel({ oportunidades, etapas }) {
  const stats = useMemo(() => {
    const totalValor = oportunidades.reduce((s, o) => s + (parseFloat(o.valor_estimado) || 0), 0)
    const totalPonderado = oportunidades.reduce((s, o) => s + (parseFloat(o.valor_estimado) || 0) * (parseInt(o.probabilidad) || 0) / 100, 0)
    const ganadas = oportunidades.filter(o => o.estado === 'ganado').length
    const perdidas = oportunidades.filter(o => o.estado === 'perdido').length
    const activas = oportunidades.filter(o => o.estado === 'activo' || !o.estado).length
    const conversion = (ganadas + perdidas) > 0 ? (ganadas / (ganadas + perdidas) * 100).toFixed(0) : '—'
    const porEtapa = etapas.map(e => {
      const ops = oportunidades.filter(o => o.etapa_id === e.id)
      const val = ops.reduce((s, o) => s + (parseFloat(o.valor_estimado) || 0), 0)
      const pond = ops.reduce((s, o) => s + (parseFloat(o.valor_estimado) || 0) * (parseInt(o.probabilidad) || 0) / 100, 0)
      const daysInStage = ops.map(o => {
        const from = o.fecha_creacion ? new Date(o.fecha_creacion) : new Date()
        return Math.round((new Date() - from) / 86400000)
      })
      const avgDays = daysInStage.length ? Math.round(daysInStage.reduce((a, b) => a + b, 0) / daysInStage.length) : 0
      return { ...e, count: ops.length, valor: val, ponderado: pond, avgDays }
    })
    const hoy = new Date()
    const esteMes = hoy.getMonth()
    const esteAnio = hoy.getFullYear()
    const proxMes = esteMes === 11 ? 0 : esteMes + 1
    const proxAnio = esteMes === 11 ? esteAnio + 1 : esteAnio
    function enMes(ops, mes, anio) {
      return ops.filter(o => {
        if (!o.fecha_cierre_estimada) return false
        const d = new Date(o.fecha_cierre_estimada)
        return d.getMonth() === mes && d.getFullYear() === anio
      })
    }
    const esteMesOps = enMes(oportunidades, esteMes, esteAnio)
    const proxMesOps = enMes(oportunidades, proxMes, proxAnio)
    const forecastEsteMes = esteMesOps.reduce((s, o) => s + (parseFloat(o.valor_estimado) || 0) * (parseInt(o.probabilidad) || 0) / 100, 0)
    const forecastProxMes = proxMesOps.reduce((s, o) => s + (parseFloat(o.valor_estimado) || 0) * (parseInt(o.probabilidad) || 0) / 100, 0)
    const bottleneck = [...porEtapa].sort((a, b) => b.avgDays - a.avgDays)[0]
    const motivos = {}
    oportunidades.filter(o => o.motivo).forEach(o => {
      motivos[o.motivo] = (motivos[o.motivo] || 0) + 1
    })
    const topMotivos = Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 5)
    return { totalValor, totalPonderado, ganadas, perdidas, activas, conversion, porEtapa, forecastEsteMes, forecastProxMes, bottleneck, topMotivos }
  }, [oportunidades, etapas])

  const mesesSpan = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const hoy = new Date()
  const mesLabel = mesesSpan[hoy.getMonth()]

  return (
    <div style={{ background: 'var(--sf)', borderRadius: 12, border: '1px solid var(--bd)', padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>📊 Reportes del pipeline</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
        {[
          ['Oportunidades', stats.activas + stats.ganadas + stats.perdidas, 'var(--tx)'],
          ['Valor total', fmt(stats.totalValor), 'var(--ok)'],
          ['Valor ponderado', fmt(stats.totalPonderado), 'var(--ac)'],
          ['Conversión', stats.conversion + '%', 'var(--ok)'],
          ['Ganadas', stats.ganadas, 'var(--ok)'],
          ['Perdidas', stats.perdidas, 'var(--bad)'],
        ].map(([l, v, c]) => (
          <div key={l} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 2 }}>{l}</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Forecast */}
      <div style={{ marginTop: 12, padding: '10px 0', borderTop: '1px solid var(--bd)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📈 Proyección de ingresos</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            ['Este mes (' + mesLabel + ')', fmt(stats.forecastEsteMes), 'var(--ac)'],
            ['Próximo mes', fmt(stats.forecastProxMes), 'var(--ok)'],
          ].map(([l, v, c]) => (
            <div key={l} style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--mu)', marginBottom: 2 }}>{l}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: c }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Salud del pipeline */}
      {stats.porEtapa.filter(e => e.count > 0).length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bd)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>🏥 Salud del pipeline</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {stats.porEtapa.filter(e => e.count > 0).map(e => {
              const isMax = e.id === stats.bottleneck?.id
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 8px', background: 'var(--bg)', borderRadius: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.color || '#6366f1', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{e.nombre}</span>
                  <span style={{ color: 'var(--mu)' }}>{e.count} ops</span>
                  <span style={{ color: isMax ? 'var(--bad)' : 'var(--mu)', fontWeight: isMax ? 700 : 400 }}>
                    ⏱ {e.avgDays}d {isMax ? '(cuello de botella)' : ''}
                  </span>
                </div>
              )
            })}
          </div>
          {stats.topMotivos.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>🎯 Motivos más frecuentes:</div>
              {stats.topMotivos.map(([m, c]) => (
                <div key={m} style={{ display: 'flex', gap: 6, padding: '2px 8px' }}>
                  <span style={{ color: 'var(--mu)' }}>{m}</span>
                  <span style={{ fontWeight: 600 }}>{c}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Funnel */}
      {stats.porEtapa.filter(e => e.count > 0).length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bd)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Embudo de ventas:</div>
          <svg width="100%" height={stats.porEtapa.filter(e => e.count > 0).length * 34 + 4} style={{ display: 'block' }}>
            {(() => {
              const stages = stats.porEtapa.filter(e => e.count > 0)
              const maxW = 320, minW = 80
              return stages.map((s, i) => {
                const w = Math.round(minW + (maxW - minW) * (1 - i / Math.max(1, stages.length - 1)))
                const x = Math.round((maxW - w) / 2)
                const y = i * 34
                return (
                  <g key={s.id}>
                    <rect x={x} y={y} width={w} height={26} rx={4} fill={s.color || '#6366f1'} opacity={0.85} />
                    <text x={x + 6} y={y + 17} fill="#fff" fontSize={10} fontWeight={600}>{s.nombre}</text>
                    <text x={x + w - 6} y={y + 17} fill="#fff" fontSize={10} textAnchor="end">
                      {s.count} ops — {fmt(s.valor)}
                    </text>
                    <text x={x + w - 6} y={y + 26} fill="rgba(255,255,255,.7)" fontSize={8} textAnchor="end">
                      pond. {fmt(s.ponderado)}
                    </text>
                  </g>
                )
              })
            })()}
          </svg>
        </div>
      )}
    </div>
  )
}

export function Pipeline() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion, allSucs, allClis, allProds, allUsers } = useApp()
  const { me } = useAuth()
  const [etapas, setEtapas] = useState([])
  const [oportunidades, setOportunidades] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAdmin, setModalAdmin] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [suc, setSuc] = useState(sucSesion || '')
  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [sortBy, setSortBy] = useState('fecha_creacion')
  const [sortDesc, setSortDesc] = useState(true)
  const [showReports, setShowReports] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [tareas, setTareas] = useState([])
  const [modalNuevaTarea, setModalNuevaTarea] = useState(false)
  const [tareaEditId, setTareaEditId] = useState(null)
  const [filtroTareaEstado, setFiltroTareaEstado] = useState('')
  const [filtroTareaUsuario, setFiltroTareaUsuario] = useState('')

  const isSupervisor = me?.rol === 'admin' || me?.rol === 'supervisor'

  const tareasFiltradas = useMemo(() => {
    let list = tareas
    if (filtroTareaEstado) list = list.filter(t => t.estado === filtroTareaEstado)
    if (filtroTareaUsuario) list = list.filter(t => t.creado_nombre === filtroTareaUsuario || t.creado_nombre?.includes(filtroTareaUsuario))
    return list
  }, [tareas, filtroTareaEstado, filtroTareaUsuario])

  const tareasVencidasCount = useMemo(() => {
    return tareas.filter(t => t.estado !== 'finalizado' && t.fecha_fin && new Date(t.fecha_fin) < new Date()).length
  }, [tareas])

  const tareasUsuarios = useMemo(() => [...new Set(tareas.map(t => t.creado_nombre).filter(Boolean))], [tareas])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [et, ops, tas] = await Promise.all([
        api('GET', '/pipeline/etapas'),
        api('GET', `/pipeline/oportunidades${suc ? `?suc_id=${suc}` : ''}`),
        api('GET', '/tareas'),
      ])
      setEtapas(Array.isArray(et) ? et : [])
      setOportunidades(Array.isArray(ops) ? ops : [])
      setTareas(Array.isArray(tas) ? tas : [])
      const ven = (Array.isArray(tas) ? tas : []).filter(t => t.estado !== 'finalizado' && t.fecha_fin && new Date(t.fecha_fin) < new Date()).length
      tareasVencidas.count = ven
      tareasVencidas.listeners.forEach(l => l(ven))
    } catch { toast('Error cargando pipeline', 'err') }
    finally { setLoading(false) }
  }, [suc])

  useEffect(() => { load() }, [load])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleDragStart(event) {
    setActiveId(event.active.id)
  }

  function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over || !over.id) return
    const opId = active.id
    if (opId === over.id) return
    const op = oportunidades.find(o => o.id === opId)
    if (!op || op.etapa_id === over.id) return
    const destEtapa = etapas.find(e => e.id === over.id)
    if (destEtapa && destEtapa.nombre === 'Ganado') {
      const msg = op.venta_id
        ? `¿Marcar "${op.nombre}" como Ganado? (Venta #${op.venta_id.slice(-6)} asociada)`
        : `¿Marcar "${op.nombre}" como Ganado?`
      if (!window.confirm(msg)) return
    }
    moverOp(opId, over.id)
  }

  const usuarios = useMemo(() => {
    const set = new Set()
    oportunidades.forEach(o => { set.add(o.usuario_nombre || o.vend_nombre || '') })
    set.delete('')
    return [...set].sort()
  }, [oportunidades])

  const oppFiltered = useMemo(() => {
    let list = [...oportunidades]
    if (filtroTexto) {
      const q = filtroTexto.toLowerCase()
      list = list.filter(o => (o.nombre || '').toLowerCase().includes(q) || (o.cli_nombre || '').toLowerCase().includes(q))
    }
    if (filtroUsuario) list = list.filter(o => (o.usuario_nombre || o.vend_nombre) === filtroUsuario)
    if (filtroEstado) list = list.filter(o => o.estado === filtroEstado)
    if (sortBy) {
      list.sort((a, b) => {
        let va = a[sortBy] || '', vb = b[sortBy] || ''
        if (sortBy === 'valor_estimado') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0 }
        else if (sortBy === 'probabilidad') { va = parseInt(va) || 0; vb = parseInt(vb) || 0 }
        else if (sortBy === 'fecha_creacion' || sortBy === 'fecha_cierre_estimada') { va = va || ''; vb = vb || '' }
        const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb
        return sortDesc ? -cmp : cmp
      })
    }
    return list
  }, [oportunidades, filtroTexto, filtroUsuario, filtroEstado, sortBy, sortDesc])

  async function editarOp(id, data) {
    await api('PUT', `/pipeline/oportunidades/${id}`, data)
    toast('Oportunidad actualizada', 'ok')
    load()
  }

  async function moverOp(id, etapa_id) {
    await api('PUT', `/pipeline/oportunidades/${id}`, { etapa_id })
    load()
  }

  async function inlineSave(id, data) {
    await api('PUT', `/pipeline/oportunidades/${id}`, data)
    setOportunidades(prev => prev.map(o => o.id === id ? { ...o, ...data } : o))
  }

  async function eliminarOp(id) {
    if (!window.confirm('¿Eliminar esta oportunidad?')) return
    await api('DELETE', `/pipeline/oportunidades/${id}`)
    toast('Eliminada', 'ok')
    setDetalle(null)
    load()
  }

  async function archivarOp(id) {
    await api('PUT', `/pipeline/oportunidades/${id}`, { estado: 'archivado' })
    toast('Archivada', 'ok')
    setDetalle(null)
    load()
  }

  async function desarchivarOp(id) {
    await api('PUT', `/pipeline/oportunidades/${id}`, { estado: 'activo' })
    toast('Restaurada', 'ok')
    setDetalle(null)
    load()
  }

  async function crearTarea(data) {
    await api('POST', '/tareas', data)
    toast('Tarea creada', 'ok')
    setModalNuevaTarea(false)
    load()
  }

  async function editarTarea(id, data) {
    await api('PUT', `/tareas/${id}`, data)
    setTareas(prev => prev.map(t => t.id === id ? { ...t, ...data } : t))
    toast('Tarea actualizada', 'ok')
  }

  async function eliminarTarea(id) {
    if (!window.confirm('¿Eliminar esta tarea?')) return
    await api('DELETE', `/tareas/${id}`)
    toast('Tarea eliminada', 'ok')
    load()
  }

  const activeOp = useMemo(() => oportunidades.find(o => o.id === activeId), [activeId, oportunidades])

  if (loading) return <Loader />

  return (
    <div>
      {/* Controls bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={suc} onChange={e => setSuc(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 13 }}>
          <option value="">📍 Todas las sucursales</option>
          {allSucs.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => setModalAdmin(true)}>⚙️ Etapas</button>
        <button className={`btn btn-sm ${showReports ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowReports(p => !p)}>📊 Reportes</button>
        <button className={`btn btn-sm ${showCalendar ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowCalendar(p => !p)}>📅 Contactos</button>
        {isSupervisor && <button className="btn btn-primary btn-sm" onClick={() => setModalNuevaTarea(true)}>➕ Nueva tarea</button>}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={filtroTexto} onChange={e => setFiltroTexto(e.target.value)} placeholder="🔍 Buscar por nombre o cliente..."
          style={{ flex: '1 1 180px', padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 12 }} />
        <select value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 12 }}>
          <option value="">👤 Todos los usuarios</option>
          {usuarios.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 12 }}>
          <option value="">📋 Todos (excepto archivados)</option>
          <option value="activo">🟢 Activos</option>
          <option value="ganado">✅ Ganados</option>
          <option value="perdido">❌ Perdidos</option>
          <option value="archivado">📦 Archivados</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 12 }}>
          <option value="fecha_creacion">📅 Fecha creación</option>
          <option value="valor_estimado">💰 Valor</option>
          <option value="probabilidad">📊 Probabilidad</option>
          <option value="fecha_cierre_estimada">🎯 Cierre estimado</option>
        </select>
        <button className="btn btn-sm btn-secondary" onClick={() => setSortDesc(p => !p)}
          style={{ padding: '6px 10px', fontSize: 12 }}>
          {sortDesc ? '↓ Desc' : '↑ Asc'}
        </button>
        <select value={filtroTareaEstado} onChange={e => setFiltroTareaEstado(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 12 }}>
          <option value="">📋 Todas las tareas</option>
          <option value="pendiente">⏳ Pendientes</option>
          <option value="en_curso">▶ En curso</option>
          <option value="finalizado">✓ Finalizadas</option>
        </select>
        <select value={filtroTareaUsuario} onChange={e => setFiltroTareaUsuario(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 12 }}>
          <option value="">👤 Todos los creadores</option>
          {tareasUsuarios.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Reports */}
      {showReports && <ReportsPanel oportunidades={oppFiltered} etapas={etapas} />}

      {/* Calendar */}
      {showCalendar && <CalendarPanel oportunidades={oppFiltered} />}

      {/* Kanban board */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, minHeight: '60vh' }}>
          {etapas.map(etapa => {
            const ops = oppFiltered.filter(o => o.etapa_id === etapa.id)
            return (
              <DroppableColumn key={etapa.id} id={etapa.id}>
                <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: etapa.color || '#6366f1', display: 'inline-block' }} />
                    {etapa.nombre}
                  </span>
                  <span style={{ background: 'var(--bd)', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{ops.length}</span>
                </div>
                <div style={{ padding: 8, flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
                  {ops.length === 0 && <div style={{ textAlign: 'center', padding: 20, fontSize: 12, color: 'var(--mu)' }}>Sin oportunidades</div>}
                  {ops.map(op => (
                    <DraggableCard key={op.id} op={op} etapas={etapas} etapaActual={etapa}
                      onMover={moverOp} onClick={setDetalle} onInlineSave={inlineSave} isSupervisor={isSupervisor} />
                  ))}
                </div>
              </DroppableColumn>
            )
          })}

          {/* Tareas column */}
          <div style={{ minWidth: 260, maxWidth: 300, flex: '0 0 auto', background: 'var(--sf)', borderRadius: 12, border: '1.5px solid var(--bd)', display: 'flex', flexDirection: 'column', maxHeight: '60vh' }}>
            <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📋 Tareas</span>
              <span style={{ background: 'var(--bd)', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{tareasFiltradas.length}</span>
            </div>
            <div style={{ padding: 8, flex: 1, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
              {tareasFiltradas.length === 0 && <div style={{ textAlign: 'center', padding: 20, fontSize: 12, color: 'var(--mu)' }}>Sin tareas</div>}
              {[['pendiente', '⏳ Pendiente', 'var(--warn)'], ['en_curso', '▶ En curso', 'var(--ac2)'], ['finalizado', '✓ Finalizado', 'var(--ok)']].map(([estado, label, color]) => {
                const items = tareasFiltradas.filter(t => t.estado === estado)
                if (items.length === 0) return null
                return (
                  <div key={estado}>
                    <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{label}</span>
                      <span style={{ background: 'var(--bd)', borderRadius: 8, padding: '0 6px', fontSize: 9 }}>{items.length}</span>
                    </div>
                    {items.map(t => (
                      <div key={t.id} style={{ background: 'var(--bg)', border: '1.5px solid var(--bd)', borderRadius: 8, padding: '8px 10px', marginBottom: 4, opacity: estado === 'finalizado' ? 0.55 : 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                          {estado !== 'finalizado' && (
                            <input type="checkbox" checked={false}
                              onChange={e => {
                                const next = estado === 'pendiente' ? 'en_curso' : 'finalizado';
                                editarTarea(t.id, { estado: next });
                              }}
                              style={{ cursor: 'pointer', transform: 'scale(.85)' }} />
                          )}
                          <div style={{ fontWeight: 600, fontSize: 12, flex: 1, textDecoration: estado === 'finalizado' ? 'line-through' : 'none' }}>{t.descripcion}</div>
                          {isSupervisor && <button className="btn btn-sm" style={{ padding: '1px 3px', fontSize: 9, color: 'var(--mu)' }} onClick={() => { if (window.confirm('¿Eliminar tarea?')) eliminarTarea(t.id) }}>🗑️</button>}
                        </div>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', fontSize: 9, color: 'var(--mu)', marginBottom: 2 }}>
                          {t.fecha_fin && <span style={{ color: estado !== 'finalizado' && new Date(t.fecha_fin) < new Date() ? 'var(--bad)' : 'var(--mu)' }}>📅 {new Date(t.fecha_fin).toLocaleDateString('es-AR')}</span>}
                          <span>👤 {t.creado_nombre}</span>
                        </div>
                        {estado !== 'finalizado' ? (
                          tareaEditId === t.id ? (
                            <div onClick={e => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginTop: 2 }}>
                                <button className={`btn btn-sm ${estado === 'en_curso' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '1px 5px', fontSize: 9 }} onClick={() => editarTarea(t.id, { estado: 'en_curso' })}>▶</button>
                                <button className="btn btn-sm btn-secondary" style={{ padding: '1px 5px', fontSize: 9 }} onClick={() => { setTareaEditId(null); editarTarea(t.id, { estado: 'finalizado' }) }}>✓</button>
                              </div>
                              <textarea value={t.observacion || ''} onChange={e => editarTarea(t.id, { observacion: e.target.value })}
                                placeholder="Obs..." rows={1}
                                style={{ width: '100%', marginTop: 2, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--bd)', fontSize: 10, resize: 'vertical', boxSizing: 'border-box' }} />
                            </div>
                          ) : (
                            <button className="btn btn-sm" style={{ padding: '1px 4px', fontSize: 9 }} onClick={() => setTareaEditId(t.id)}>
                              {t.observacion ? '💬 ' + t.observacion.substr(0, 20) + (t.observacion.length > 20 ? '…' : '') : '✏️ obs.'}
                            </button>
                          )
                        ) : null}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeOp && (
            <div style={{ background: 'var(--bg)', border: '2px solid var(--ac)', borderRadius: 10, padding: '10px 12px', width: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{activeOp.nombre}</div>
              {activeOp.cli_nombre && <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 4 }}>👤 {activeOp.cli_nombre}</div>}
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ok)' }}>{fmt(activeOp.valor_estimado)}</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Modals */}
      <ModalAdminEtapas open={modalAdmin} onClose={() => setModalAdmin(false)} onUpdate={load} />
      {isSupervisor && <ModalNuevaTarea open={modalNuevaTarea} onClose={() => setModalNuevaTarea(false)} allUsers={allUsers} allSucs={allSucs} me={me} onSave={crearTarea} />}
      {detalle && (
        <ModalDetalleOportunidad open={!!detalle} onClose={() => setDetalle(null)} oportunidad={detalle}
          etapas={etapas} allClis={allClis} onEdit={editarOp} onDelete={eliminarOp}
          onArchive={archivarOp} onUnarchive={desarchivarOp} />
      )}
    </div>
  )
}

// ── Modal Admin Etapas ──
function ModalAdminEtapas({ open, onClose, onUpdate }) {
  const { api } = useApi()
  const { toast } = useToast()
  const [items, setItems] = useState([])
  const [newNombre, setNewNombre] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')

  useEffect(() => {
    if (open) api('GET', '/pipeline/etapas').then(setItems).catch(() => {})
  }, [open])

  async function crear() {
    if (!newNombre.trim()) { toast('Nombre requerido', 'err'); return }
    await api('POST', '/pipeline/etapas', { nombre: newNombre.trim(), color: newColor })
    toast('Etapa creada', 'ok')
    setNewNombre(''); setNewColor('#6366f1')
    const list = await api('GET', '/pipeline/etapas')
    setItems(list); onUpdate()
  }

  async function editar(id, data) {
    await api('PUT', `/pipeline/etapas/${id}`, data)
    setItems(items.map(e => e.id === id ? { ...e, ...data } : e))
    onUpdate()
  }

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar esta etapa? Las oportunidades se moverán a la primera etapa.')) return
    await api('DELETE', `/pipeline/etapas/${id}`)
    setItems(items.filter(e => e.id !== id))
    onUpdate()
  }

  async function mover(id, dir) {
    const idx = items.findIndex(e => e.id === id)
    if (idx === -1) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= items.length) return
    const newItems = [...items]
    ;[newItems[idx], newItems[newIdx]] = [newItems[newIdx], newItems[idx]]
    setItems(newItems)
    await Promise.all([
      api('PUT', `/pipeline/etapas/${id}`, { orden: newIdx + 1 }),
      api('PUT', `/pipeline/etapas/${newItems[newIdx].id}`, { orden: idx + 1 }),
    ])
  }

  return (
    <Modal open={open} onClose={onClose} title="⚙️ Administrar etapas" size="md">
      <div style={{ marginBottom: 12 }}>
        {items.map((e, i) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--bd)' }}>
            <input type="color" value={e.color || '#6366f1'} onChange={e2 => editar(e.id, { color: e2.target.value })}
              style={{ width: 28, height: 28, padding: 0, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
            <input value={e.nombre} onChange={e2 => editar(e.id, { nombre: e2.target.value })}
              style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bd)', fontSize: 13 }} />
            <button className="btn btn-sm" disabled={i === 0} onClick={() => mover(e.id, -1)} title="Subir">↑</button>
            <button className="btn btn-sm" disabled={i === items.length - 1} onClick={() => mover(e.id, 1)} title="Bajar">↓</button>
            <button className="btn btn-sm btn-danger" onClick={() => eliminar(e.id)} title="Eliminar">🗑️</button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Nueva etapa:</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            style={{ width: 28, height: 28, padding: 0, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
          <input value={newNombre} onChange={e => setNewNombre(e.target.value)} placeholder="Nombre de la nueva etapa..."
            style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--bd)', fontSize: 13 }}
            onKeyDown={e => { if (e.key === 'Enter') crear() }} />
          <button className="btn btn-primary btn-sm" onClick={crear}>➕ Crear</button>
        </div>
      </div>
    </Modal>
  )
}

// ── Modal Detalle ──
function ModalDetalleOportunidad({ open, onClose, oportunidad, etapas, allClis, onEdit, onDelete, onArchive, onUnarchive }) {
  const [tab, setTab] = useState('detalle')
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({})
  const [seguimiento, setSeguimiento] = useState([])
  const [nuevaNota, setNuevaNota] = useState('')
  const [nuevaAccion, setNuevaAccion] = useState('contacto')
  const [showEmail, setShowEmail] = useState(false)
  const [emailPara, setEmailPara] = useState('')
  const [emailMsg, setEmailMsg] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const { api } = useApi()
  const { toast } = useToast()

  useEffect(() => {
    if (open && oportunidad) {
      setForm({
        nombre: oportunidad.nombre || '',
        etapa_id: oportunidad.etapa_id || '',
        valor_estimado: String(oportunidad.valor_estimado || ''),
        probabilidad: String(oportunidad.probabilidad || '50'),
        fecha_cierre_estimada: (oportunidad.fecha_cierre_estimada || '').substr(0, 10),
        notas: oportunidad.notas || '',
        observacion: oportunidad.observacion || '',
        proximo_contacto: (oportunidad.proximo_contacto || '').substr(0, 10),
        estado: oportunidad.estado || 'activo',
        motivo: oportunidad.motivo || '',
      })
      setEditMode(false)
      setShowEmail(false)
      setEmailPara('')
      setEmailMsg('')
      setNuevaNota('')
      api('GET', `/pipeline/oportunidades/${oportunidad.id}/seguimiento`).then(setSeguimiento).catch(() => setSeguimiento([]))
    }
  }, [open, oportunidad])

  const etapaActual = etapas.find(e => e.id === form.etapa_id)
  const cli = allClis.find(c => c.id === oportunidad?.cliente_id)
  const isArchived = oportunidad?.estado === 'archivado'

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }))

  async function guardarEdit() {
    try {
      const payload = {
        nombre: form.nombre, etapa_id: form.etapa_id,
        valor_estimado: form.valor_estimado, probabilidad: form.probabilidad,
        fecha_cierre_estimada: form.fecha_cierre_estimada || null,
        notas: form.notas, observacion: form.observacion,
        proximo_contacto: form.proximo_contacto || null, estado: form.estado,
      }
      if (form.motivo) payload.motivo = form.motivo
      await onEdit(oportunidad.id, payload)
      setEditMode(false)
    } catch (e) { toast(e.message, 'err') }
  }

  async function enviarEmail() {
    if (!emailPara.trim()) { toast('Email destinatario requerido', 'err'); return }
    setSendingEmail(true)
    try {
      await api('POST', `/pipeline/oportunidades/${oportunidad.id}/enviar-email`, { para: emailPara.trim(), mensaje: emailMsg })
      toast('Email enviado', 'ok')
      setShowEmail(false)
      api('GET', `/pipeline/oportunidades/${oportunidad.id}/seguimiento`).then(setSeguimiento).catch(() => {})
    } catch (e) { toast(e.message, 'err') }
    finally { setSendingEmail(false) }
  }

  async function agregarSeguimiento() {
    if (!nuevaNota.trim()) { toast('Escribí una nota', 'err'); return }
    try {
      await api('POST', `/pipeline/oportunidades/${oportunidad.id}/seguimiento`, { accion: nuevaAccion, nota: nuevaNota })
      setNuevaNota('')
      const rows = await api('GET', `/pipeline/oportunidades/${oportunidad.id}/seguimiento`)
      setSeguimiento(rows)
      toast('Registrado', 'ok')
    } catch (e) { toast(e.message, 'err') }
  }

  if (!oportunidad) return null

  return (
    <Modal open={open} onClose={onClose} title={oportunidad.nombre} size="lg"
      footer={<>
        {!editMode && !isArchived && <button className="btn btn-secondary" onClick={() => setEditMode(true)}>✏️ Editar</button>}
        {isArchived ? (
          <button className="btn btn-primary" onClick={() => onUnarchive(oportunidad.id)}>📦 Restaurar</button>
        ) : (
          <button className="btn btn-secondary" style={{ borderColor: 'var(--mu)' }} onClick={() => onArchive(oportunidad.id)}>📦 Archivar</button>
        )}
        <button className="btn btn-danger" onClick={() => onDelete(oportunidad.id)}>🗑️ Eliminar</button>
        <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
      </>}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '2px solid var(--bd)', paddingBottom: 8 }}>
        {[['detalle', '📋 Detalle'], ['seguimiento', `📝 Seguimiento (${seguimiento.length})`], ['email', '📧 Email']].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'detalle' && (
        editMode ? (
          <div>
            <Field label="Nombre"><input value={form.nombre} onChange={set('nombre')} /></Field>
            <Field label="Etapa">
              <select value={form.etapa_id} onChange={set('etapa_id')}>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </Field>
            <div className="fr">
              <Field label="Valor estimado ($)"><input type="number" value={form.valor_estimado} onChange={set('valor_estimado')} min="0" /></Field>
              <Field label="Probabilidad %"><input type="number" value={form.probabilidad} onChange={set('probabilidad')} min="0" max="100" /></Field>
            </div>
            <Field label="Fecha cierre estimada"><input type="date" value={form.fecha_cierre_estimada} onChange={set('fecha_cierre_estimada')} /></Field>
            <Field label="Próximo contacto">
              <input type="date" value={form.proximo_contacto} onChange={set('proximo_contacto')} />
            </Field>
            <Field label="Observación del cliente">
              <textarea value={form.observacion} onChange={set('observacion')} rows={2} placeholder="Ej: dijo que lo consulta con su pareja, vuelve la semana que viene..." />
            </Field>
            <Field label="Notas internas"><textarea value={form.notas} onChange={set('notas')} rows={2} /></Field>
            <Field label="Estado">
              <select value={form.estado} onChange={set('estado')}>
                <option value="activo">🟢 Activo</option>
                <option value="ganado">✅ Ganado</option>
                <option value="perdido">❌ Perdido</option>
                <option value="archivado">📦 Archivado</option>
              </select>
            </Field>
            {(form.estado === 'ganado' || form.estado === 'perdido') && (
              <Field label={form.estado === 'ganado' ? '🎯 Motivo del cierre' : '❌ Motivo de pérdida'}>
                <select value={form.motivo} onChange={set('motivo')}>
                  <option value="">Seleccionar motivo...</option>
                  {form.estado === 'ganado'
                    ? ['Precio', 'Relación', 'Producto', 'Servicio', 'Plazo', 'Confianza', 'Otro'].map(m => <option key={m} value={m}>{m}</option>)
                    : ['Precio', 'Competencia', 'Timing', 'No califica', 'Sin decisión', 'Presupuesto', 'Otro'].map(m => <option key={m} value={m}>{m}</option>)
                  }
                </select>
              </Field>
            )}
            <button className="btn btn-primary" onClick={guardarEdit}>💾 Guardar cambios</button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 2 }}>Etapa</div>
                <div style={{ fontWeight: 700 }}>{etapaActual?.nombre || '—'}</div>
              </div>
              <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 2 }}>Cliente</div>
                <div style={{ fontWeight: 700 }}>{cli ? (cli.nombre + ' ' + (cli.apellido || '')) : (oportunidad.cli_nombre || '—')}</div>
              </div>
              <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 2 }}>Valor estimado</div>
                <div style={{ fontWeight: 700, color: 'var(--ok)' }}>{fmt(oportunidad.valor_estimado)}</div>
              </div>
              <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 2 }}>Probabilidad</div>
                <div style={{ fontWeight: 700 }}>{oportunidad.probabilidad}%</div>
              </div>
              <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 2 }}>Usuario</div>
                <div style={{ fontWeight: 700 }}>{oportunidad.usuario_nombre || oportunidad.vend_nombre || '—'}</div>
              </div>
              <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 2 }}>Estado</div>
                <div style={{ fontWeight: 700 }}>
                  {oportunidad.estado === 'ganado' ? '✅ Ganado' : oportunidad.estado === 'perdido' ? '❌ Perdido' : oportunidad.estado === 'archivado' ? '📦 Archivado' : '🟢 Activo'}
                  {oportunidad.motivo && <span style={{ fontSize: 11, color: 'var(--mu)', marginLeft: 6 }}>({oportunidad.motivo})</span>}
                </div>
              </div>
              <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 2 }}>Creado</div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{oportunidad.fecha_creacion ? new Date(oportunidad.fecha_creacion).toLocaleDateString('es-AR') : '—'}</div>
              </div>
              {oportunidad.fecha_cierre_estimada && (
                <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 2 }}>Cierre estimado</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: new Date(oportunidad.fecha_cierre_estimada) < new Date() ? 'var(--bad)' : undefined }}>
                    {new Date(oportunidad.fecha_cierre_estimada).toLocaleDateString('es-AR')}
                  </div>
                </div>
              )}
              {oportunidad.proximo_contacto && (
                <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 2 }}>Próximo contacto</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: new Date(oportunidad.proximo_contacto) < new Date() ? 'var(--bad)' : 'var(--ac)' }}>
                    📞 {new Date(oportunidad.proximo_contacto).toLocaleDateString('es-AR')}
                  </div>
                </div>
              )}
            </div>
            {oportunidad.notas && (
              <div style={{ marginTop: 12, background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 2 }}>Notas internas</div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{oportunidad.notas}</div>
              </div>
            )}
            {oportunidad.observacion && (
              <div style={{ marginTop: 12, background: 'var(--sf)', borderRadius: 8, padding: '10px 14px', borderLeft: '3px solid var(--ac)' }}>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 2 }}>💬 Observación del cliente</div>
                <div style={{ fontSize: 13, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>{oportunidad.observacion}</div>
              </div>
            )}
          </div>
        )
      )}

      {tab === 'seguimiento' && (
        <div>
          <div style={{ background: 'var(--sf)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <select value={nuevaAccion} onChange={e => setNuevaAccion(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--bd)', fontSize: 12 }}>
                <option value="contacto">📞 Contacto</option>
                <option value="contactado">✅ Contactado</option>
                <option value="propuesta">📄 Enviada propuesta</option>
                <option value="negociacion">🤝 Negociación</option>
                <option value="cierre">🎯 Cierre</option>
                <option value="postventa">📞 Postventa</option>
                <option value="nota">📝 Nota</option>
              </select>
              <input value={nuevaNota} onChange={e => setNuevaNota(e.target.value)} placeholder="Agregar nota..." style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--bd)', fontSize: 12 }} />
              <button className="btn btn-primary btn-sm" onClick={agregarSeguimiento}>➕</button>
            </div>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {seguimiento.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: 'var(--mu)', fontSize: 13 }}>Sin seguimiento aún</div>}
            {seguimiento.map(s => (
              <div key={s.id} style={{ background: 'var(--sf)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: 600 }}>{s.accion}</span>
                  <span style={{ color: 'var(--mu)', fontSize: 11 }}>{s.fecha ? new Date(s.fecha).toLocaleString('es-AR') : ''}</span>
                </div>
                {s.nota && <div style={{ color: 'var(--tx)', marginBottom: 2 }}>{s.nota}</div>}
                <div style={{ fontSize: 10, color: 'var(--mu)' }}>por {s.usuario_nombre || 'Sistema'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'email' && (
        <div>
          <div style={{ background: 'var(--sf)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>📧 Enviar email</div>
            <Field label="Email destinatario *">
              <input value={emailPara} onChange={e => setEmailPara(e.target.value)}
                placeholder={cli?.email || 'cliente@ejemplo.com'} autoFocus />
            </Field>
            <Field label="Mensaje adicional">
              <textarea value={emailMsg} onChange={e => setEmailMsg(e.target.value)}
                rows={4} placeholder="Escribí un mensaje personalizado..." />
            </Field>
            <button className="btn btn-primary" onClick={enviarEmail} disabled={sendingEmail}>
              {sendingEmail ? 'Enviando...' : '📤 Enviar email'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Modal Nueva Tarea ──
function ModalNuevaTarea({ open, onClose, allUsers, allSucs, me, onSave }) {
  const [sucId, setSucId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setSucId(me?.suc_id || '')
      setDescripcion('')
      setFechaFin('')
      setSelectedUsers([])
      setUserSearch('')
    }
  }, [open])

  const usersFiltered = allUsers.filter(u => {
    if (u.id === me?.id) return false
    if (sucId && u.suc_id !== sucId) return false
    if (userSearch && !u.nombre.toLowerCase().includes(userSearch.toLowerCase())) return false
    return u.activo !== false
  })

  function toggleUser(id) {
    setSelectedUsers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function guardar() {
    if (!descripcion.trim()) { toast('Descripción requerida', 'err'); return }
    setSaving(true)
    try {
      await onSave({ descripcion: descripcion.trim(), fecha_fin: fechaFin || null, asignado_a: selectedUsers, suc_id: sucId || null })
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="➕ Nueva tarea" size="md"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar} disabled={saving}>
          {saving ? 'Guardando...' : '✅ Crear tarea'}
        </button></>}>
      <Field label="Descripción *">
        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2} placeholder="Ej: Llamar a cliente para seguimiento..." autoFocus />
      </Field>
      <Field label="Fecha finalización">
        <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
      </Field>
      <Field label="Sucursal">
        <select value={sucId} onChange={e => setSucId(e.target.value)}>
          <option value="">Todas</option>
          {allSucs.filter(s => s.activo !== false).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </Field>
      <Field label="Asignar a usuarios">
        <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Buscar usuario..." style={{ marginBottom: 6 }} />
        <div style={{ maxHeight: 160, overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 8, padding: 4 }}>
          {usersFiltered.length === 0 && <div style={{ padding: 8, fontSize: 12, color: 'var(--mu)', textAlign: 'center' }}>Sin usuarios</div>}
          {usersFiltered.map(u => (
            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', cursor: 'pointer', borderRadius: 4, fontSize: 13 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--sf)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={() => toggleUser(u.id)} />
              {u.nombre} <span style={{ color: 'var(--mu)', fontSize: 11 }}>({u.rol})</span>
            </label>
          ))}
        </div>
      </Field>
    </Modal>
  )
}

// ── Calendar Panel ──
function CalendarPanel({ oportunidades }) {
  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())

  const contactos = useMemo(() => {
    const map = {}
    oportunidades.forEach(o => {
      if (!o.proximo_contacto) return
      const d = new Date(o.proximo_contacto)
      const key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()
      if (!map[key]) map[key] = []
      map[key].push(o)
    })
    return map
  }, [oportunidades])

  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const primerDia = new Date(anio, mes, 1).getDay()
  const mesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes]

  function cambiarMes(delta) {
    let m = mes + delta
    let a = anio
    if (m < 0) { m = 11; a-- }
    if (m > 11) { m = 0; a++ }
    setMes(m)
    setAnio(a)
  }

  function mismoDia(a, b) {
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  }

  const celdas = []
  for (let i = 0; i < primerDia; i++) celdas.push(null)
  for (let d = 1; d <= diasEnMes; d++) celdas.push(d)

  return (
    <div style={{ background: 'var(--sf)', borderRadius: 12, border: '1px solid var(--bd)', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button className="btn btn-sm btn-secondary" onClick={() => cambiarMes(-1)}>‹ Mes ant.</button>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{mesNombre} {anio}</span>
        <button className="btn btn-sm btn-secondary" onClick={() => cambiarMes(1)}>Mes sig. ›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 12 }}>
        {['Do','Lu','Ma','Mi','Ju','Vi','Sa'].map(n => (
          <div key={n} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--mu)', padding: 4 }}>{n}</div>
        ))}
        {celdas.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />
          const key = anio + '-' + mes + '-' + d
          const ops = contactos[key] || []
          const esHoy = mismoDia(hoy, new Date(anio, mes, d))
          return (
            <div key={d} style={{
              textAlign: 'center', padding: '6px 0', fontSize: 12, borderRadius: 6, cursor: ops.length ? 'pointer' : 'default',
              background: esHoy ? 'var(--ac)' : ops.length ? 'var(--bg)' : 'transparent',
              color: esHoy ? '#fff' : ops.length ? 'var(--tx)' : 'var(--mu)',
              fontWeight: ops.length ? 700 : 400,
              border: ops.length ? '1px solid var(--bd)' : 'none'
            }}>
              {d}
              {ops.length > 0 && <div style={{ fontSize: 8, color: esHoy ? 'rgba(255,255,255,.7)' : 'var(--ac)' }}>{ops.length} 📞</div>}
            </div>
          )
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📞 Próximos contactos:</div>
        {oportunidades.filter(o => o.proximo_contacto && new Date(o.proximo_contacto) >= new Date(new Date().toDateString()))
          .sort((a, b) => new Date(a.proximo_contacto) - new Date(b.proximo_contacto))
          .slice(0, 8).map(o => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--bd)' }}>
              <span style={{ fontSize: 10, color: new Date(o.proximo_contacto) < new Date() ? 'var(--bad)' : 'var(--ac)', fontWeight: 600, minWidth: 80 }}>
                {new Date(o.proximo_contacto).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
              </span>
              <span style={{ flex: 1, fontWeight: 600 }}>{o.nombre}</span>
              <span style={{ color: 'var(--mu)', fontSize: 11 }}>{o.cli_nombre || ''}</span>
              <span style={{ color: 'var(--ok)', fontWeight: 700, fontSize: 11 }}>{fmt(o.valor_estimado)}</span>
            </div>
          ))}
      </div>
    </div>
  )
}
