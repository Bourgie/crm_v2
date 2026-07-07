import { useState, useEffect } from 'react'

export const chatUnread = { count: 0, listeners: [] }
export function useChatUnread() {
  const [n, setN] = useState(chatUnread.count)
  useEffect(() => {
    chatUnread.listeners.push(setN)
    return () => { chatUnread.listeners = chatUnread.listeners.filter(l => l !== setN) }
  }, [])
  return n
}
export function setChatUnread(n) {
  chatUnread.count = n
  chatUnread.listeners.forEach(l => l(n))
}

export const pipelineVencidas = { count: 0, listeners: [] }
export function usePipelineVencidas() {
  const [n, setN] = useState(pipelineVencidas.count)
  useEffect(() => {
    pipelineVencidas.listeners.push(setN)
    return () => { pipelineVencidas.listeners = pipelineVencidas.listeners.filter(l => l !== setN) }
  }, [])
  return n
}

export const tareasVencidas = { count: 0, listeners: [] }
export function useTareasVencidas() {
  const [n, setN] = useState(tareasVencidas.count)
  useEffect(() => {
    tareasVencidas.listeners.push(setN)
    return () => { tareasVencidas.listeners = tareasVencidas.listeners.filter(l => l !== setN) }
  }, [])
  return n
}

export const pipelineActivity = { count: 0, data: [], listeners: [] }
export function usePipelineActivity() {
  const [n, setN] = useState(pipelineActivity.count)
  useEffect(() => {
    pipelineActivity.listeners.push(setN)
    return () => { pipelineActivity.listeners = pipelineActivity.listeners.filter(l => l !== setN) }
  }, [])
  return n
}
