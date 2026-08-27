import { useRecharts } from '../hooks/useRecharts'

const defaultFmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const fmtK = (v) => '$' + ((v || 0) / 1000).toFixed(0) + 'k'

const cumplColor = (p) => (p == null ? 'var(--mu)' : p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--bad)')

function ChartTooltip({ active, payload, fmt }) {
  if (!active || !payload || !payload.length) return null
  const row = payload[0].payload || {}
  return (
    <div style={{ background: 'var(--sf, #fff)', border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 10px', fontSize: 12, minWidth: 170 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {row.nombre}
        {row.usando_global && <span style={{ fontSize: 11, color: 'var(--mu)', marginLeft: 5 }}>🌐 global</span>}
        {row.sin_objetivo && <span style={{ fontSize: 11, color: 'var(--warn)', marginLeft: 5 }}>Sin objetivo</span>}
      </div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: p.color }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{fmt(p.value)}</span>
        </div>
      ))}
      {row.cumplimiento != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4, borderTop: '1px solid var(--bd)', paddingTop: 4 }}>
          <span style={{ color: 'var(--mu)' }}>Cumplimiento:</span>
          <span style={{ fontWeight: 700, color: cumplColor(row.cumplimiento) }}>{row.cumplimiento}%</span>
        </div>
      )}
      {row.cumplimiento == null && row.objetivo === 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4, borderTop: '1px solid var(--bd)', paddingTop: 4 }}>
          <span style={{ color: 'var(--warn)' }}>Sin objetivo definido</span>
        </div>
      )}
      {row.proyeccion != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'var(--mu)' }}>Cierre proyectado:</span>
          <span style={{ fontWeight: 600 }}>{fmt(row.proyeccion)}</span>
        </div>
      )}
      {row.delta_anio_anterior != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'var(--mu)' }}>vs año anterior:</span>
          <span style={{ fontWeight: 600, color: row.delta_anio_anterior >= 0 ? 'var(--ok)' : 'var(--bad)' }}>
            {row.delta_anio_anterior >= 0 ? '+' : ''}{row.delta_anio_anterior}%
          </span>
        </div>
      )}
    </div>
  )
}

export default function ObjetivosSucChart({ data, fmt = defaultFmt, height = 220 }) {
  const recharts = useRecharts()

  if (!recharts) {
    return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  }

  const sucs = data?.sucursales || []
  const total = data?.total

  if (!data || sucs.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--mu)', fontSize: 13 }}>
        Sin datos de sucursales para mostrar
      </div>
    )
  }

  const chartData = [...sucs, ...(total ? [total] : [])].map(r => ({
    nombre: r.nombre.length > 14 ? r.nombre.substr(0, 13) + '…' : r.nombre,
    'Vendido': r.ventas_mes,
    'Objetivo': r.objetivo || 0,
    'Año anterior': r.ventas_anio_anterior,
    cumplimiento: r.cumplimiento,
    proyeccion: r.proyeccion,
    delta_anio_anterior: r.delta_anio_anterior,
    usando_global: r.usando_global,
    sin_objetivo: r.sin_objetivo || r.objetivo === 0,
  }))

  const { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LabelList } = recharts

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 18, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} width={44} />
        <Tooltip content={<ChartTooltip fmt={fmt} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Vendido" fill="var(--ok)" radius={[4, 4, 0, 0]}>
          <LabelList dataKey="cumplimiento" position="top" formatter={(v) => (v != null ? `${v}%` : '')} fill="var(--mu)" fontSize={10} fontWeight={700} />
        </Bar>
        <Bar dataKey="Objetivo" fill="var(--ac)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Año anterior" fill="var(--mu)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}