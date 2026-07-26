import { useState } from 'react'

export function PasswordInput({ value, onChange, placeholder, style, ...props }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder || '••••••••'}
        style={{ ...style, width: '100%', paddingRight: 40 }}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
          color: 'var(--mu)', padding: '4px 6px', lineHeight: 1
        }}
        tabIndex={-1}
        title={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  )
}
