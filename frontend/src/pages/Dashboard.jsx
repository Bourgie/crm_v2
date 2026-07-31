import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useAuth, useApp } from '../store'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const VentasBarChart = lazy(() => import('../components/VentasBarChart'))

const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const localDate = (d) => { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return y+'-'+m+'-'+day; }

function KpiCard({ label, value, sub, icon, color }) {
  return (
    <div className="kpi-card" style={{ borderLeft: `3px solid ${color || 'var(--ac)'}` }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: color || 'inherit' }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {icon && <div className="kpi-icon">{icon}</div>}
    </div>
  )
}

export function Dashboard() {
  const { api } = useApi()
  const { me } = useAuth()
  const { sucSesion } = useApp()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fechaTareas, setFechaTareas] = useState(() => localDate(new Date()))

  const hour = new Date().getHours()
  const isToday = fechaTareas === localDate(new Date())
  const greeting = isToday
    ? (hour < 12 ? '🌅 Buenos días' : hour < 19 ? '☀️ Buenas tardes' : '🌙 Buenas noches')
    : '📅 Planificación del día'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api('GET', `/dashboard?suc_id=${sucSesion || ''}&fecha=${fechaTareas}`)
      setData({ dash: d })
    } catch { /* offline or error */ }
    finally { setLoading(false) }
  }, [sucSesion, fechaTareas])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  const raw = data?.dash || data || {}
  const kpis = raw?.kpis || {}
  const ventasMes = raw?.dias7 || raw?.ventas_mes || []
  const topProds = raw?.top_productos || []
  const topClis = raw?.top_clientes || []
  const objetivo = raw?.objetivo || null
  const ultimasVentas = raw?.ultimas_ventas || []
  const pipelineTareas = raw?.pipeline_tareas || []
  const postventasPendientes = raw?.postventas_pendientes || []
  const contactosPendientes = raw?.contactos_pendientes || []
  const tareasHoy = raw?.tareas_hoy || []
  const cumpleanos = raw?.cumpleanos || []
  const tareasDelDia = [...pipelineTareas, ...contactosPendientes.map(c => ({
    id: c.id, accion: 'contacto_pendiente',
    fecha: c.proximo_contacto, nota: 'Contactar a ' + (c.cli_nombre || c.nombre),
    oportunidad_nombre: c.nombre, usuario_nombre: c.usuario_nombre
  }))].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 10)

  // kpis.ventas_hoy = {t, n}  OR  plain number
  const ventasHoyTotal = kpis.ventas_hoy?.t ?? kpis.ventas_hoy ?? 0
  const ventasHoyN     = kpis.ventas_hoy?.n ?? kpis.n_ventas_hoy ?? 0
  const ventasMesTotal = kpis.ventas_mes?.t ?? kpis.ventas_mes ?? 0
  const clientesMes    = kpis.clientes?.mes ?? kpis.clientes_nuevos_mes ?? 0

  return (
    <div>
      {/* Greeting + date picker */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>{greeting}, {me?.nombre}</h1>
          <p style={{ color: 'var(--mu)', fontSize: 13, marginTop: 4 }}>
            {format(new Date(fechaTareas), "EEEE d 'de' MMMM", { locale: es })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => {
            const d = new Date(fechaTareas + 'T12:00:00'); d.setDate(d.getDate() - 1);
            setFechaTareas(localDate(d));
          }}>◀</button>
          <input type="date" value={fechaTareas} onChange={e => setFechaTareas(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--bd)', fontSize: 12 }} />
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => {
            const d = new Date(fechaTareas + 'T12:00:00'); d.setDate(d.getDate() + 1);
            setFechaTareas(localDate(d));
          }}>▶</button>
          {!isToday && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setFechaTareas(localDate(new Date()))}>Hoy</button>
          )}
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Ventas hoy" value={fmt(ventasHoyTotal)} sub={`${ventasHoyN} transacciones`} icon="💰" color="var(--ok)" />
        <KpiCard label="Ventas del mes" value={fmt(ventasMesTotal)} icon="📊" />
        <KpiCard label="Clientes nuevos" value={clientesMes} sub="este mes" icon="👥" color="var(--ac2)" />
        <KpiCard label="Pendientes" value={kpis.pendientes_sin_despachar ?? 0} sub="sin despachar" icon="🚚" color={kpis.pendientes_sin_despachar > 0 ? 'var(--warn)' : undefined} />
        <KpiCard label="Cta. corriente" value={kpis.ctacte_vencidas || 0} sub="deudas vencidas" icon="📒" color={kpis.ctacte_vencidas > 0 ? 'var(--bad)' : undefined} />
      </div>

      {/* Cumpleaños próximos */}
      {cumpleanos.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #f472b6' }}>
          <div className="card-header">
            <h3>🎂 Próximos cumpleaños</h3>
            {cumpleanos.filter(c => c.hoy).length > 0 && (
              <span style={{ background: '#f472b6', color: '#fff', borderRadius: 10, fontSize: 12, fontWeight: 700, padding: '1px 7px' }}>
                {cumpleanos.filter(c => c.hoy).length} hoy
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cumpleanos.slice(0, 10).map((c, i) => (
              <div key={c.cliente_id||'bday-'+i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}
                onClick={() => navigate('/app/clientes')}>
                <span style={{ fontSize: 16 }}>{c.hoy ? '🎉' : c.dias <= 3 ? '🎈' : '🎂'}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{c.nombre}</span>
                  <span style={{ color: 'var(--mu)', marginLeft: 6, fontSize: 12 }}>
                    {c.edad} años — {c.hoy ? '🎉 HOY' : `en ${c.dias} día${c.dias !== 1 ? 's' : ''}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tareas del día */}
      <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--ac)' }}>
        <div className="card-header">
          <h3>📋 Recordatorios — {format(new Date(fechaTareas), "d 'de' MMMM", { locale: es })}</h3>
          <div style={{ display: 'flex', gap: 4 }}>
            {tareasHoy.length > 0 && (
              <span style={{ background: 'var(--ac2)', color: '#fff', borderRadius: 10, fontSize: 12, fontWeight: 700, padding: '1px 7px' }}>
                {tareasHoy.length} tareas
              </span>
            )}
            {postventasPendientes.length > 0 && (
              <span style={{ background: 'var(--warn)', color: '#fff', borderRadius: 10, fontSize: 12, fontWeight: 700, padding: '1px 7px' }}>
                {postventasPendientes.length} postventas
              </span>
            )}
          </div>
        </div>
        {tareasDelDia.length === 0 && postventasPendientes.length === 0 && tareasHoy.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--mu)', fontSize: 13 }}>
            ✅ Sin tareas pendientes para este día
          </div>
        ) : (
          <>
            {tareasDelDia.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tareasDelDia.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--bd)', fontSize: 13, cursor: 'pointer' }}
                    onClick={() => navigate('/app/pipeline')}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: t.accion === 'contacto_pendiente' ? 'var(--bad)' : 'var(--ac)'
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.oportunidad_nombre || t.nota}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--mu)' }}>
                        {t.accion === 'contacto_pendiente' ? '📞 Pendiente de contacto' :
                         t.accion === 'contacto' || t.accion === 'contactado' ? '📞 ' + t.accion :
                         t.accion === 'propuesta' ? '📄 Propuesta enviada' :
                         t.accion === 'negociacion' ? '🤝 Negociación' :
                         t.accion === 'cierre' ? '🎯 Cierre' :
                         t.accion === 'postventa' ? '📞 Postventa' : '📝 ' + t.accion}
                        {t.usuario_nombre ? ' — ' + t.usuario_nombre : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--mu)', flexShrink: 0 }}>
                      {t.fecha ? new Date(t.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {tareasHoy.length > 0 && (
              <div style={{ marginTop: 8, padding: '8px 0', borderTop: '1px solid var(--bd)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ac2)', marginBottom: 4 }}>📋 Tareas</div>
                {tareasHoy.map(t => (
                  <div key={`tarea-${t.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, cursor: 'pointer' }}
                    onClick={() => navigate('/app/pipeline')}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: t.estado === 'en_curso' ? 'var(--ac)' : t.estado === 'finalizado' ? 'var(--ok)' : 'var(--warn)'
                    }} />
                    <span style={{ flex: 1, fontWeight: 600 }}>{t.descripcion}</span>
                    <span style={{ color: 'var(--mu)' }}>{t.creado_nombre}</span>
                    <span style={{
                      fontSize: 12, padding: '1px 5px', borderRadius: 4,
                      background: t.estado === 'en_curso' ? 'var(--ac2)' : t.estado === 'finalizado' ? 'var(--ok)' : 'var(--sf)',
                      color: t.estado === 'en_curso' || t.estado === 'finalizado' ? '#fff' : 'var(--mu)',
                      fontWeight: 600
                    }}>
                      {t.estado === 'en_curso' ? '▶ En curso' : t.estado === 'finalizado' ? '✓ Hecho' : '⏳ Pendiente'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {postventasPendientes.length > 0 && (
              <div style={{ marginTop: 8, padding: '8px 0', borderTop: '1px solid var(--bd)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warn)', marginBottom: 4 }}>📦 Postventas pendientes</div>
                {postventasPendientes.slice(0, 4).map(pv => (
                  <div key={pv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, cursor: 'pointer' }}
                    onClick={() => navigate('/app/pipeline')}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ac2)', flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{pv.cli_nombre || pv.nombre}</span>
                    <span style={{ color: 'var(--mu)' }}>{pv.usuario_nombre}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Objetivo mensual */}
      {objetivo && objetivo.monto > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 13 }}>🎯 Objetivo del mes</span>
              <span style={{ fontSize: 12, color: 'var(--mu)', marginLeft: 8 }}>
                ({new Date().toLocaleString('es-AR', { month: 'long', year: 'numeric' })})
              </span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, color: (objetivo.porcentaje || 0) >= 80 ? 'var(--ok)' : (objetivo.porcentaje || 0) >= 50 ? 'var(--warn)' : 'var(--bad)' }}>
              {objetivo.porcentaje ?? 0}%
            </span>
          </div>
          <div style={{ background: 'var(--bd)', borderRadius: 8, height: 14, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: '100%', width: `${Math.min(100, objetivo.porcentaje || 0)}%`, background: (objetivo.porcentaje || 0) >= 80 ? 'var(--ok)' : (objetivo.porcentaje || 0) >= 50 ? 'var(--warn)' : 'var(--bad)', borderRadius: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12, textAlign: 'center' }}>
            <div><div style={{ color: 'var(--mu)' }}>Vendido</div><div style={{ fontWeight: 700, color: 'var(--ac)' }}>{fmt(objetivo.ventas_mes)}</div></div>
            <div><div style={{ color: 'var(--mu)' }}>Objetivo</div><div style={{ fontWeight: 700 }}>{fmt(objetivo.monto)}</div></div>
            <div><div style={{ color: 'var(--mu)' }}>Falta</div><div style={{ fontWeight: 700, color: (objetivo.falta || 0) > 0 ? 'var(--bad)' : 'var(--ok)' }}>{fmt(objetivo.falta || 0)}</div></div>
          </div>
        </div>
      )}
      {objetivo && objetivo.monto === 0 && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px' }}>
          <span style={{ color: 'var(--mu)', fontSize: 13 }}>📊 Sin objetivo definido para este mes</span>
          {['admin', 'supervisor'].includes(me?.rol) && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/app/config')}>Definir objetivo</button>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Ventas del mes */}
        <div className="card">
          <div className="card-header"><h3>📈 Ventas últimos días</h3></div>
          <Suspense fallback={<div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>}>
            <VentasBarChart data={ventasMes} fmt={fmt} />
          </Suspense>
        </div>

        {/* Top productos */}
        <div className="card">
          <div className="card-header"><h3>🏆 Top productos</h3></div>
          {topProds.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topProds.slice(0, 5).map((p, i) => (
                <div key={p.prod_id||p.nombre||'tp-'+i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--sf)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--mu)', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--mu)' }}>{p.cantidad} vendidos</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ok)', flexShrink: 0 }}>{fmt(p.total)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 24 }}><p>Sin datos aún</p></div>
          )}
        </div>
      </div>

      {/* Últimas ventas */}
      {ultimasVentas.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h3>🕐 Últimas ventas</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Método</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>
                {ultimasVentas.slice(0, 8).map((v, i) => (
                  <tr key={v.id||'uv-'+i}>
                    <td data-label="#" style={{ fontSize: 12, color: 'var(--mu)' }}>#{v.numero}</td>
                    <td data-label="Fecha" style={{ fontSize: 12 }}>{new Date(v.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td data-label="Cliente" style={{ fontSize: 13 }}>{v.cli_nombre || <span style={{ color: 'var(--mu)' }}>Consumidor</span>}</td>
                    <td data-label="Vendedor" style={{ fontSize: 12, color: 'var(--mu)' }}>{v.vend_nombre || '—'}</td>
                    <td data-label="Método" style={{ fontSize: 12 }}>{v.pago || '—'}</td>
                    <td data-label="Total" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ok)' }}>{fmt(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>⚡ Accesos rápidos</h3></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: '🛒 Nueva venta', to: '/app/pos' },
            { label: '👥 Clientes', to: '/app/clientes' },
            { label: '💰 Ver caja', to: '/app/caja' },
            { label: '📦 Stock', to: '/app/productos' },
            { label: '💸 Gastos', to: '/app/gastos' },
            { label: '📋 Ventas de hoy', to: '/app/ventas' },
          ].map((a) => (
            <button type="button" key={a.to} className="btn btn-secondary" onClick={() => navigate(a.to)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

