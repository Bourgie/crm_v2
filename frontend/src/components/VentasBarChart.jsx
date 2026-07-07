import { useRecharts } from '../hooks/useRecharts'

const defaultFmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const defaultFmtV = (v) => '$' + ((v || 0) / 1000).toFixed(0) + 'k'

export default function VentasBarChart({ data, height = 180, fmt = defaultFmt, fmtV = defaultFmtV, tickV = true, emptyText = 'Sin ventas registradas aún' }) {
  const recharts = useRecharts()

  if (!data || data.length === 0) {
    return <div className="empty-state"><div className="empty-icon">📊</div><p>{emptyText}</p></div>
  }

  if (!recharts) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  }

  const { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } = recharts
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <XAxis dataKey="fecha" tick={{ fontSize: 12 }} tickFormatter={(v) => (v || '').substr(5)} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={tickV ? fmtV : undefined} width={tickV ? 40 : undefined} />
        <Tooltip formatter={(v) => fmt(v)} />
        <Bar dataKey="total" fill="var(--ac)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
