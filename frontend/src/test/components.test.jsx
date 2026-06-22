import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../components/Modal'
import { SearchBar, Pagination, Field, ConfirmDialog } from '../components/UI'

// ── Modal ──────────────────────────────────────────────────────
describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Modal open={false} onClose={() => {}} title="Test" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders title and children when open', () => {
    render(
      <Modal open onClose={() => {}} title="Mi modal">
        <p>Contenido del modal</p>
      </Modal>
    )
    expect(screen.getByText('Mi modal')).toBeInTheDocument()
    expect(screen.getByText('Contenido del modal')).toBeInTheDocument()
  })

  it('calls onClose when × button clicked', async () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Test" />)
    await userEvent.click(screen.getByText('×'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose on Escape key', async () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Test"><div /></Modal>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when clicking overlay backdrop', async () => {
    const onClose = vi.fn()
    const { container } = render(<Modal open onClose={onClose} title="Test"><div /></Modal>)
    const overlay = container.querySelector('.modal-overlay')
    // Click on overlay itself (not modal content)
    fireEvent.click(overlay, { target: overlay })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders footer when provided', () => {
    render(
      <Modal open onClose={() => {}} title="Test" footer={<button>Aceptar</button>}>
        <div />
      </Modal>
    )
    expect(screen.getByText('Aceptar')).toBeInTheDocument()
  })

  it('respects size prop via maxWidth', () => {
    const { container } = render(<Modal open onClose={() => {}} title="Test" size="lg"><div /></Modal>)
    const modal = container.querySelector('.modal')
    expect(modal.style.maxWidth).toBe('680px')
  })
})

// ── SearchBar ──────────────────────────────────────────────────
describe('SearchBar', () => {
  it('renders with placeholder', () => {
    render(<SearchBar value="" onChange={() => {}} placeholder="Buscar clientes..." />)
    expect(screen.getByPlaceholderText('Buscar clientes...')).toBeInTheDocument()
  })

  it('calls onChange with input value', async () => {
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)
    await userEvent.type(screen.getByRole('textbox'), 'abc')
    expect(onChange).toHaveBeenCalledWith('a')
    expect(onChange).toHaveBeenCalledWith('b')
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('shows current value', () => {
    render(<SearchBar value="Juan" onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('Juan')
  })

  it('shows search icon', () => {
    const { container } = render(<SearchBar value="" onChange={() => {}} />)
    expect(container.textContent).toContain('🔍')
  })
})

// ── Pagination ─────────────────────────────────────────────────
describe('Pagination', () => {
  it('renders nothing when only 1 page', () => {
    const { container } = render(<Pagination page={1} total={10} perPage={25} onChange={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders page buttons for multiple pages', () => {
    render(<Pagination page={1} total={100} perPage={25} onChange={() => {}} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('disables prev button on first page', () => {
    render(<Pagination page={1} total={100} perPage={25} onChange={() => {}} />)
    expect(screen.getByText('‹')).toBeDisabled()
    expect(screen.getByText('›')).not.toBeDisabled()
  })

  it('disables next button on last page', () => {
    render(<Pagination page={4} total={100} perPage={25} onChange={() => {}} />)
    expect(screen.getByText('›')).toBeDisabled()
    expect(screen.getByText('‹')).not.toBeDisabled()
  })

  it('calls onChange with correct page on button click', async () => {
    const onChange = vi.fn()
    render(<Pagination page={2} total={100} perPage={25} onChange={onChange} />)
    await userEvent.click(screen.getByText('3'))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('shows total records', () => {
    render(<Pagination page={1} total={87} perPage={25} onChange={() => {}} />)
    expect(screen.getByText('87 registros')).toBeInTheDocument()
  })
})

// ── Field ──────────────────────────────────────────────────────
describe('Field', () => {
  it('renders label and children', () => {
    render(<Field label="Nombre"><input placeholder="Nombre" /></Field>)
    expect(screen.getByText('Nombre')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Nombre')).toBeInTheDocument()
  })

  it('shows asterisk for required fields', () => {
    render(<Field label="Email" required><input /></Field>)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('does not show asterisk for optional fields', () => {
    const { container } = render(<Field label="Email"><input /></Field>)
    expect(container.querySelector('span')).toBeNull()
  })
})

// ── ConfirmDialog ──────────────────────────────────────────────
describe('ConfirmDialog', () => {
  it('renders with title and message when open', () => {
    render(
      <ConfirmDialog open onClose={() => {}} onConfirm={() => {}}
        title="Eliminar elemento" message="¿Estás seguro?" />
    )
    expect(screen.getByText('Eliminar elemento')).toBeInTheDocument()
    expect(screen.getByText('¿Estás seguro?')).toBeInTheDocument()
  })

  it('calls onConfirm and onClose when confirm button clicked', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(
      <ConfirmDialog open onClose={onClose} onConfirm={onConfirm}
        title="Test" message="¿Confirmar?" confirmLabel="Sí, borrar" />
    )
    await userEvent.click(screen.getByText('Sí, borrar'))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when cancel clicked', async () => {
    const onClose = vi.fn()
    render(<ConfirmDialog open onClose={onClose} onConfirm={() => {}} title="Test" message="Test" />)
    await userEvent.click(screen.getByText('Cancelar'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
