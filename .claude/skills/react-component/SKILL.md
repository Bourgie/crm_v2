---
name: react-component
description: Usar cuando se crea o modifica un componente React en FlexCRM. Se activa al escribir componentes nuevos, modales, formularios, tablas, o cualquier pieza de UI en frontend/src/. Enforcea las convenciones específicas del proyecto.
allowed-tools: Read, Write, Edit, Glob
---

## Convenciones de componentes React en FlexCRM

### Estado: qué va dónde

**Va en Zustand (`useStore()`):**
- Datos del usuario autenticado (`user`, `sucActual`)
- Listas globales que se usan en múltiples páginas (`allSucs`, `allProductos`)
- Notificaciones toast (`toastOk`, `toastErr`)
- Badges de notificaciones (pendientes, ctacte, chat)

**Va en `useState` local:**
- Estado de UI: modal abierto/cerrado, tab activa, loading
- Datos del formulario en edición (borrador antes de guardar)
- Filtros de búsqueda locales

**Nunca:**
- `localStorage` para datos de negocio (solo preferencias de UI como tema)
- Props drilling de más de 2 niveles — mover al store

### Llamadas a la API

Siempre usar el hook `useApi`, nunca `fetch()` directo:

```jsx
import { useApi } from '../hooks/useApi';

const { api } = useApi();

// GET
const data = await api('/endpoint');

// POST
const result = await api('/endpoint', { method: 'POST', body: payload });

// PUT
await api(`/endpoint/${id}`, { method: 'PUT', body: payload });

// DELETE
await api(`/endpoint/${id}`, { method: 'DELETE' });
```

`useApi` maneja automáticamente: el header `X-Empresa`, el token JWT, y los errores de red.

### Notificaciones

```jsx
const { toastOk, toastErr } = useStore();

// Éxito
toastOk('Cliente guardado correctamente');

// Error
toastErr('Error al guardar: verifique los datos');
```

### stock_suc — el error más común

`stock_suc` es un objeto JSON `{ suc_id: cantidad }`, **nunca un número**.

```jsx
// ❌ INCORRECTO — causa React error #31
<td>{producto.stock_suc}</td>

// ✅ CORRECTO — acceder con el suc_id
<td>{producto.stock_suc?.[sucActual?.id] ?? 0}</td>

// ✅ Para mostrar stock total
<td>{Object.values(producto.stock_suc || {}).reduce((a, b) => a + b, 0)}</td>
```

### Estructura base de una página

```jsx
import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useApi } from '../hooks/useApi';

export default function NombrePagina() {
  const { user, sucActual, toastOk, toastErr } = useStore();
  const { api } = useApi();
  
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [filtro, setFiltro] = useState('');

  useEffect(() => { load(); }, [sucActual]);

  async function load() {
    setLoading(true);
    try {
      const data = await api('/endpoint');
      setItems(data || []);
    } catch (e) {
      toastErr('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }

  async function guardar(form) {
    try {
      if (editando) {
        await api(`/endpoint/${editando.id}`, { method: 'PUT', body: form });
        toastOk('Actualizado correctamente');
      } else {
        await api('/endpoint', { method: 'POST', body: form });
        toastOk('Creado correctamente');
      }
      setModalOpen(false);
      setEditando(null);
      load();
    } catch (e) {
      toastErr('Error al guardar');
    }
  }

  const itemsFiltrados = items.filter(i =>
    i.nombre?.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>Título</h1>
        <div className="page-actions">
          <input
            className="fc"
            placeholder="Buscar..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => { setEditando(null); setModalOpen(true); }}>
            Nuevo
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Cargando...</div>
      ) : (
        <table className="tabla">
          <thead>
            <tr><th>Columna</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {itemsFiltrados.map(item => (
              <tr key={item.id}>
                <td>{item.nombre}</td>
                <td>
                  <button onClick={() => { setEditando(item); setModalOpen(true); }}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <ModalNombre
          item={editando}
          onGuardar={guardar}
          onCerrar={() => { setModalOpen(false); setEditando(null); }}
        />
      )}
    </div>
  );
}
```

### Clases CSS del design system de FlexCRM

```
.page             — contenedor principal de una página
.page-header      — header con título y acciones
.page-actions     — grupo de botones/inputs del header
.tabla            — tabla estilizada estándar
.btn              — botón base
.btn-primary      — botón azul principal
.btn-danger       — botón rojo para eliminar
.fc               — input estándar (form control)
.modal-overlay    — fondo oscuro del modal
.modal            — caja del modal
.loading          — spinner/texto de carga
```

### Exportación Excel — patrón estándar

```jsx
function exportarExcel() {
  const url = api.buildUrl('/endpoint/export');
  window.open(url, '_blank');
}

// Botón:
<button className="btn" onClick={exportarExcel}>Exportar Excel</button>
```
