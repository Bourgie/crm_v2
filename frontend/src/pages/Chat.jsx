import { useState, useEffect, useRef, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useApp, useAuth, useToast } from '../store'

// ─── Global badge state (used by Sidebar) ───
export const chatUnread = { count: 0, listeners: [] }
export function useChatUnread() {
  const [n, setN] = useState(chatUnread.count)
  useEffect(() => {
    chatUnread.listeners.push(setN)
    return () => { chatUnread.listeners = chatUnread.listeners.filter(l => l !== setN) }
  }, [])
  return n
}
function setChatUnread(n) {
  chatUnread.count = n
  chatUnread.listeners.forEach(l => l(n))
}

// ─── Helpers ───
const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''
const fmtDay = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const t = new Date()
  const ayer = new Date(t); ayer.setDate(t.getDate() - 1)
  if (d.toDateString() === t.toDateString()) return 'HOY'
  if (d.toDateString() === ayer.toDateString()) return 'AYER'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const truncate = (s, n) => s && s.length > n ? s.substr(0, n) + '...' : (s || '')

export function Chat() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion, allSucs } = useApp()
  const { me } = useAuth()

  const [conversations, setConversations] = useState({ groups: [], contacts: [] })
  const [activeId, setActiveId] = useState(null)  // 'all' | suc_id
  const [activeMsgs, setActiveMsgs] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState(null)
  const [lockInfo, setLockInfo] = useState(null)
  const [showSidebar, setShowSidebar] = useState(true)  // mobile responsive

  const msgsRef = useRef(null)
  const inputRef = useRef(null)
  const lastDateRef = useRef(null)
  const pollMsgsRef = useRef(null)
  const pollConvsRef = useRef(null)

  const userRoles = Array.isArray(me?.roles) ? me.roles : [me?.rol]
  const esAdmin = userRoles.includes('admin') || userRoles.includes('supervisor')

  // ─── Load conversations list ───
  const loadConversations = useCallback(async () => {
    if (!sucSesion) return
    try {
      const c = await api('GET', '/chat/conversations?suc_id=' + sucSesion)
      setConversations({ groups: c.groups || [], contacts: c.contacts || [] })
      // Update global badge
      const total = (c.groups || []).reduce((a, g) => a + (g.unread || 0), 0)
        + (c.contacts || []).reduce((a, x) => a + (x.unread || 0), 0)
      setChatUnread(total)
    } catch {}
  }, [sucSesion])

  // ─── Load lock status ───
  const loadLock = useCallback(async () => {
    try { const l = await api('GET', '/chat/lock-all'); setLockInfo(l) } catch {}
  }, [])

  // ─── Load messages of active conversation ───
  const loadMessages = useCallback(async (full = false) => {
    if (!activeId || !sucSesion) return
    try {
      const since = !full && lastDateRef.current ? `&since=${encodeURIComponent(lastDateRef.current)}` : ''
      const peer = activeId
      const data = await api('GET', `/chat/messages?suc_id=${sucSesion}&peer=${peer}&limit=200${since}`)
      if (!Array.isArray(data)) return
      if (full) {
        setActiveMsgs(data)
        if (data.length) lastDateRef.current = data[data.length - 1].fecha
      } else if (data.length) {
        setActiveMsgs(prev => {
          const existing = new Set(prev.map(m => m.id))
          const news = data.filter(m => !existing.has(m.id))
          if (!news.length) return prev
          return [...prev, ...news]
        })
        lastDateRef.current = data[data.length - 1].fecha
      }
      // Mark read in this chat
      api('POST', '/chat/mark-read', { suc_id: sucSesion, peer }).catch(() => {})
    } catch {}
  }, [activeId, sucSesion])

  // ─── Initial load ───
  useEffect(() => {
    loadConversations()
    loadLock()
    pollConvsRef.current = setInterval(loadConversations, 10000)
    return () => clearInterval(pollConvsRef.current)
  }, [loadConversations, loadLock])

  // ─── Active chat polling ───
  useEffect(() => {
    if (!activeId) return
    lastDateRef.current = null
    setActiveMsgs([])
    loadMessages(true)
    pollMsgsRef.current = setInterval(() => loadMessages(false), 3000)
    return () => clearInterval(pollMsgsRef.current)
  }, [activeId, loadMessages])

  // ─── Auto-scroll ───
  useEffect(() => {
    if (msgsRef.current) {
      const el = msgsRef.current
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
      if (nearBottom || activeMsgs.length <= 5) {
        setTimeout(() => { el.scrollTop = el.scrollHeight }, 50)
      }
    }
  }, [activeMsgs])

  // ─── Send message ───
  async function enviar() {
    const txt = texto.trim()
    if (!txt || enviando || !activeId) return
    setTexto('')
    setEnviando(true)
    try {
      await api('POST', '/chat/messages', {
        texto: txt,
        suc_destino: activeId,
        suc_origen: sucSesion,
        reply_to: reply?.id || null,
      })
      setReply(null)
      loadMessages(false)
      loadConversations()
    } catch (e) { toast(e.message, 'err'); setTexto(txt) }
    finally { setEnviando(false); inputRef.current?.focus() }
  }

  // ─── Pin/unpin conversation ───
  async function togglePin(contact) {
    try {
      await api('POST', '/chat/pin', { suc_id: sucSesion, peer: contact.id, fijado: !contact.fijado })
      loadConversations()
    } catch (e) { toast(e.message, 'err') }
  }

  // ─── Lock/unlock general chat (admin only) ───
  async function toggleLock() {
    const activo = !lockInfo?.activo
    let hasta = null
    if (activo) {
      const horas = prompt('¿Por cuántas horas restringir el chat general a admins?', '24')
      if (!horas) return
      const h = parseFloat(horas)
      if (!h || h <= 0) return
      hasta = new Date(Date.now() + h * 3600 * 1000).toISOString()
    }
    try {
      await api('POST', '/chat/lock-all', { activo, hasta })
      loadLock()
      toast(activo ? `🔒 Chat general bloqueado por ${parseFloat(prompt || '24')}h` : '🔓 Chat general abierto', 'ok')
    } catch (e) { toast(e.message, 'err') }
  }

  // ─── Delete message ───
  async function eliminarMensaje(id) {
    if (!window.confirm('¿Eliminar este mensaje?')) return
    try {
      await api('DELETE', '/chat/messages/' + id)
      loadMessages(true)
    } catch (e) { toast(e.message, 'err') }
  }

  // ─── Sidebar filter ───
  const filteredContacts = conversations.contacts.filter(c =>
    !search || c.nombre.toLowerCase().includes(search.toLowerCase())
  )

  // ─── Active conversation header info ───
  const activeContact = activeId === 'all'
    ? conversations.groups[0]
    : conversations.contacts.find(c => c.id === activeId)

  const isGeneralLocked = lockInfo?.activo && lockInfo.hasta && new Date(lockInfo.hasta) > new Date()
  const canPostHere = activeId !== 'all' || !isGeneralLocked || esAdmin

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: showSidebar ? '320px 1fr' : '0 1fr',
      height: 'calc(100vh - 80px)',
      background: '#f0f2f5',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid var(--bd)',
    }}>
      {/* ────── SIDEBAR ────── */}
      <div style={{
        background: '#fff',
        borderRight: '1px solid var(--bd)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'transform .25s ease',
        transform: showSidebar ? 'translateX(0)' : 'translateX(-100%)',
      }}>
        {/* Sidebar header */}
        <div style={{ padding: '14px 16px', background: '#f0f2f5', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>💬 Chats</h3>
            {esAdmin && (
              <button type="button" onClick={toggleLock} title={isGeneralLocked ? 'Desbloquear chat general' : 'Restringir chat general'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 6, borderRadius: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                {isGeneralLocked ? '🔒' : '🔓'}
              </button>
            )}
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Buscar chat..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 18, border: 'none', background: '#fff', fontSize: 13 }}
          />
        </div>

        {/* Conversations list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Groups */}
          {conversations.groups.map(g => (
            <ConvItem key={g.id}
              conv={g}
              active={activeId === g.id}
              onClick={() => setActiveId(g.id)}
              isGroup
              locked={isGeneralLocked}
            />
          ))}

          {filteredContacts.length > 0 && (
            <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--mu)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Sucursales
            </div>
          )}

          {filteredContacts.map(c => (
            <ConvItem key={c.id}
              conv={c}
              active={activeId === c.id}
              onClick={() => setActiveId(c.id)}
              onPin={() => togglePin(c)}
            />
          ))}

          {conversations.contacts.length === 0 && conversations.groups.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--mu)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontSize: 13 }}>No hay otras sucursales para chatear</div>
            </div>
          )}
        </div>
      </div>

      {/* ────── CHAT VIEW ────── */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#efeae2' }}>
        {!activeId ? (
          // Empty state
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', flexDirection: 'column', color: '#667781', padding: 40 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>💬</div>
            <h2 style={{ fontWeight: 300, margin: '0 0 8px' }}>FlexCRM Chat</h2>
            <p style={{ maxWidth: 360 }}>Elegí una sucursal o el grupo general para empezar a chatear.</p>
            {isGeneralLocked && esAdmin && (
              <div style={{ marginTop: 16, padding: '10px 16px', background: '#fff', borderRadius: 8, fontSize: 13, color: 'var(--warn)' }}>
                🔒 El chat general está restringido a admins hasta {new Date(lockInfo.hasta).toLocaleString('es-AR')}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{ padding: '10px 16px', background: '#f0f2f5', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" onClick={() => setShowSidebar(s => !s)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', display: 'none' }} className="chat-back-btn">←</button>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: activeId === 'all' ? '#25d366' : 'var(--ac)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                {activeId === 'all' ? '📢' : (activeContact?.nombre || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {activeContact?.nombre || (activeId === 'all' ? 'General' : 'Chat')}
                  {isGeneralLocked && activeId === 'all' && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--warn)' }}>🔒 Solo admins</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--mu)' }}>
                  {activeId === 'all' ? 'Mensajes visibles para todas las sucursales' : 'Sucursal — Chat directo'}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div ref={msgsRef} style={{
              flex: 1, overflowY: 'auto', padding: '16px 5%',
              background: '#efeae2',
              backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,.4) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}>
              {activeMsgs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#667781' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
                  <div style={{ fontSize: 13 }}>Sin mensajes aún. Saludá primero!</div>
                </div>
              ) : (
                activeMsgs.map((m, i) => {
                  const isMe = me && m.autor_id === me.id
                  const prev = activeMsgs[i - 1]
                  const showDay = !prev || fmtDay(prev.fecha) !== fmtDay(m.fecha)
                  const leido = m.leido_por && Array.isArray(m.leido_por) && m.leido_por.filter(id => id !== m.autor_id).length > 0
                  const replyMsg = m.reply_to ? activeMsgs.find(x => x.id === m.reply_to) : null

                  return (
                    <div key={m.id}>
                      {showDay && (
                        <div style={{ textAlign: 'center', margin: '12px 0' }}>
                          <span style={{ background: 'rgba(225,245,254,.92)', padding: '4px 10px', borderRadius: 8, fontSize: 11, color: '#54656f', fontWeight: 500 }}>
                            {fmtDay(m.fecha)}
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
                        <div style={{
                          maxWidth: '70%', minWidth: 100,
                          background: isMe ? '#d9fdd3' : '#fff',
                          padding: '6px 10px 6px 10px',
                          borderRadius: 8,
                          boxShadow: '0 1px 1px rgba(11,20,26,.13)',
                          position: 'relative',
                          fontSize: 14,
                          lineHeight: 1.4,
                        }}>
                          {!isMe && activeId === 'all' && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#06cf9c', marginBottom: 2 }}>
                              {m.autor_nombre}
                              {m.suc_origen && allSucs.find(s => s.id === m.suc_origen) && (
                                <span style={{ color: '#999', fontWeight: 400, marginLeft: 6 }}>· {allSucs.find(s => s.id === m.suc_origen).nombre}</span>
                              )}
                            </div>
                          )}
                          {!isMe && activeId !== 'all' && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#06cf9c', marginBottom: 2 }}>{m.autor_nombre}</div>
                          )}

                          {replyMsg && (
                            <div style={{ borderLeft: '3px solid #06cf9c', paddingLeft: 8, marginBottom: 4, fontSize: 12, color: '#667781', background: 'rgba(0,0,0,.03)', borderRadius: 4, padding: '4px 8px' }}>
                              <div style={{ fontWeight: 600, color: '#06cf9c' }}>{replyMsg.autor_nombre}</div>
                              <div>{truncate(replyMsg.texto, 60)}</div>
                            </div>
                          )}

                          <div style={{ wordBreak: 'break-word', color: m.eliminado ? '#999' : 'inherit', fontStyle: m.eliminado ? 'italic' : 'normal' }}>{m.texto}</div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2, fontSize: 11, color: '#667781' }}>
                            <span>{fmtTime(m.fecha)}</span>
                            {isMe && !m.eliminado && (
                              <span style={{ color: leido ? '#53bdeb' : '#667781', fontSize: 13, fontWeight: 700 }}>
                                {leido ? '✓✓' : '✓'}
                              </span>
                            )}
                          </div>

                          {/* Actions on hover */}
                          {!m.eliminado && (
                            <div className="msg-actions" style={{ position: 'absolute', top: 4, right: 4, opacity: 0, transition: 'opacity .15s', display: 'flex', gap: 4 }}>
                              <button type="button" onClick={() => setReply(m)} title="Responder" style={{ background: 'rgba(255,255,255,.9)', border: 'none', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 11 }}>↩</button>
                              {(isMe || esAdmin) && <button type="button" onClick={() => eliminarMensaje(m.id)} title="Eliminar" style={{ background: 'rgba(255,255,255,.9)', border: 'none', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 11 }}>🗑</button>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Reply preview */}
            {reply && (
              <div style={{ background: '#f0f2f5', padding: '8px 16px', borderTop: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ borderLeft: '3px solid #06cf9c', paddingLeft: 10, flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#06cf9c', fontWeight: 700 }}>Respondiendo a {reply.autor_nombre}</div>
                  <div style={{ fontSize: 12, color: '#667781' }}>{truncate(reply.texto, 80)}</div>
                </div>
                <button type="button" onClick={() => setReply(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#667781' }}>×</button>
              </div>
            )}

            {/* Input area */}
            {!canPostHere ? (
              <div style={{ background: '#f0f2f5', padding: 14, textAlign: 'center', color: 'var(--warn)', fontSize: 13, borderTop: '1px solid var(--bd)' }}>
                🔒 El chat general está restringido a administradores hasta {new Date(lockInfo.hasta).toLocaleString('es-AR')}
              </div>
            ) : (
              <div style={{ background: '#f0f2f5', padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  ref={inputRef}
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                  placeholder="Escribí un mensaje..."
                  rows={1}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 22, border: 'none', background: '#fff', fontSize: 14, resize: 'none', outline: 'none', maxHeight: 120, minHeight: 22, fontFamily: 'inherit' }}
                />
                <buttontype="button" 
                  type="button" onClick={enviar}
                  disabled={!texto.trim() || enviando}
                  style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: texto.trim() ? '#00a884' : '#8696a0', color: '#fff', cursor: texto.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}
                  title="Enviar (Enter)"
                >
                  {enviando ? '⏳' : '➤'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        .chat-conv-item:hover .pin-btn { opacity: 1 !important; }
        .chat-msg-bubble:hover .msg-actions { opacity: 1 !important; }
        @media (max-width: 768px) {
          .chat-back-btn { display: inline-block !important; }
        }
      `}</style>
    </div>
  )
}

// ─── Conversation item in sidebar ───
function ConvItem({ conv, active, onClick, onPin, isGroup, locked }) {
  const ultimo = conv.ultimo
  const subtitle = ultimo ? `${ultimo.autor_nombre || ''}${ultimo.autor_nombre ? ': ' : ''}${truncate(ultimo.texto || '', 35)}` : 'Sin mensajes'
  const tiempo = ultimo ? fmtTime(ultimo.fecha) : ''

  return (
    <div
      className="chat-conv-item"
      onClick={onClick}
      style={{
        padding: '12px 16px',
        cursor: 'pointer',
        borderBottom: '1px solid #f0f2f5',
        background: active ? '#f0f2f5' : 'transparent',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        position: 'relative',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f5f6f6' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Avatar */}
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: isGroup ? '#25d366' : 'var(--ac)',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 16, flexShrink: 0,
      }}>
        {isGroup ? '📢' : (conv.nombre || '?').charAt(0).toUpperCase()}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conv.fijado && <span style={{ fontSize: 11, marginRight: 4 }}>📌</span>}
            {conv.nombre}
            {isGroup && locked && <span style={{ marginLeft: 6, fontSize: 11 }}>🔒</span>}
          </div>
          <span style={{ fontSize: 11, color: conv.unread > 0 ? '#00a884' : 'var(--mu)', flexShrink: 0, fontWeight: conv.unread > 0 ? 600 : 400 }}>{tiempo}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <div style={{ fontSize: 12, color: 'var(--mu)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </div>
          {conv.unread > 0 && (
            <span style={{ background: '#00a884', color: '#fff', borderRadius: 12, padding: '0 7px', fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {conv.unread > 99 ? '99+' : conv.unread}
            </span>
          )}
        </div>
      </div>

      {/* Pin button (only for contacts) */}
      {onPin && (
        <buttontype="button" 
          type="button" className="pin-btn"
          onClick={(e) => { e.stopPropagation(); onPin() }}
          title={conv.fijado ? 'Desfijar' : 'Fijar conversación'}
          style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(255,255,255,.95)', border: '1px solid var(--bd)',
            borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
            opacity: conv.fijado ? 1 : 0, fontSize: 11,
            transition: 'opacity .15s',
          }}
        >
          📌
        </button>
      )}
    </div>
  )
}



