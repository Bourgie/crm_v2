import { useToast } from '../store'

export function ToastContainer() {
  const { toasts } = useToast()
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
      ))}
    </div>
  )
}
