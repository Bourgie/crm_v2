import { useRecharts } from '../hooks/useRecharts'

const COLORS = ['#6366f1', '#f97316', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

const defaultFmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

export default function PagoPieChart({ data, fmt = defaultFmt }) {
  const recharts = useRecharts()

  if (!data || data.length === 0) {
    return <div className="empty-state" style={{ padding: 32 }}><p>Sin datos</p></div>
  }

  if (!recharts) {
    return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  }

  const { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } = recharts
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="metodo"
          cx="50%"
          cy="50%"
          outerRadius={70}
          label={({ metodo, percent }) => `${metodo} ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
          style={{ fontSize: 12 }}
        >
          {data.map((_, i) => <Cell key={data[i].metodo || i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => fmt(v)} />
      </PieChart>
    </ResponsiveContainer>
  )
}
