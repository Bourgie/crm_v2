import { useRecharts } from '../hooks/useRecharts'

const defaultFmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const fmtK = (v) => '$' + ((v || 0) / 1000).toFixed(0) + 'k'

const cumplColor = (p) => (p == null ? 'var(--mu)' : p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--bad)')

function CumplBadge({ p }) {
  return (
    <span style={{
      fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 8, minWidth: 52, textAlign: 'center',
      background: p == null ? 'var(--sf)' : p >= 80 ? 'rgba(34,197,94,.15)' : p >= 50 ? 'rgba(245,158,11,.15)' : 'rgba(239,68,68,.15)',
      color: cumplColor(p),
    }}>
      {p == null ? '—' : p + '%'}
    </span>
  )
}

function DeltaBadge({ d }) {
  if (d == null) return <span style={{ fontSize: 12, color: 'var(--mu)', minWidth: 64, textAlign: 'right' }}>—</span>
  const up = d >= 0
  return (
    <span style={{ fontSize: 12, fontWeight: 700, minWidth: 64, textAlign: 'right', color: up ? 'var(--ok)' : 'var(--bad)' }}>
      {up ? '▲ +' : '▼ '}{d}% <span style={{ color: 'var(--mu)', fontWeight: 500 }}>vs año ant.</span>
    </span>
  )
}

export default function ObjetivosSucChart({ data, fmt = defaultFmt, onConfig, height = 220 }) {
  const recharts = useRecharts()

  if (!recharts) {
    return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  }

  const sucs = data?.sucursales || []
  const total = data?.total
  const sinObjetivos = !total || total.objetivo === 0

  if (!data || sucs.length === 0 || sinObjetivos) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px' }}>
        <span style={{ color: 'var(--mu)', fontSize: 13 }}>🎯 Sin objetivos definidos por sucursal para este mes</span>
        {onConfig && <button type="button" className="btn btn-primary btn-sm" onClick={onConfig}>Definir objetivos</button>}
      </div>
    )
  }

  const chartData = [...sucs, total].map(r => ({
    nombre: r.nombre.length > 14 ? r.nombre.substr(0, 13) + '…' : r.nombre,
    'Vendido': r.ventas_mes,
    'Objetivo': r.objetivo,
    'Año anterior': r.ventas_anio_anterior,
  }))

  const { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } = recharts

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {sucs.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, minWidth: 130, flex: '0 0 auto' }}>
              {s.nombre}
              {s.usando_global && <span title="Usa el objetivo global de la empresa" style={{ fontSize: 11, color: 'var(--mu)', marginLeft: 5 }}>🌐 global</span>}
              {s.sin_objetivo && <span style={{ fontSize: 11, color: 'var(--mu)', marginLeft: 5 }}>sin objetivo</span>}
            </span>
            <CumplBadge p={s.cumplimiento} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--mu)' }}>
              {fmt(s.ventas_mes)} de {fmt(s.objetivo)}
            </span>
            <span style={{ fontSize: 12, minWidth: 170, textAlign: 'right' }}>
              <span style={{ color: 'var(--mu)' }}>Cierre proyectado: </span>
              <span style={{ fontWeight: 700, color: s.proyectado_cumple === false ? 'var(--bad)' : 'var(--ok)' }}>
                {fmt(s.proyeccion)}
                {s.proyeccion_cumplimiento != null && ` (${s.proyeccion_cumplimiento}%)`}
              </span>
              {s.proyectado_cumple != null && <span style={{ marginLeft: 4 }}>{s.proyectado_cumple ? '✓' : '✗'}</span>}
            </span>
            <DeltaBadge d={s.delta_anio_anterior} />
          </div>
        ))}
        {total && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, borderTop: '2px solid var(--bd)', paddingTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, minWidth: 130, flex: '0 0 auto' }}>Total</span>
            <CumplBadge p={total.cumplimiento} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--mu)', fontWeight: 700 }}>
              {fmt(total.ventas_mes)} de {fmt(total.objetivo)}
            </span>
            <span style={{ fontSize: 12, minWidth: 170, textAlign: 'right' }}>
              <span style={{ color: 'var(--mu)' }}>Cierre proyectado: </span>
              <span style={{ fontWeight: 700, color: total.proyectado_cumple === false ? 'var(--bad)' : 'var(--ok)' }}>
                {fmt(total.proyeccion)}
                {total.proyeccion_cumplimiento != null && ` (${total.proyeccion_cumplimiento}%)`}
              </span>
              {total.proyectado_cumple != null && <span style={{ marginLeft: 4 }}>{total.proyectado_cumple ? '✓' : '✗'}</span>}
            </span>
            <DeltaBadge d={total.delta_anio_anterior} />
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} width={44} />
          <Tooltip formatter={(v) => fmt(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Vendido" fill="var(--ok)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Objetivo" fill="var(--ac)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Año anterior" fill="var(--mu)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
