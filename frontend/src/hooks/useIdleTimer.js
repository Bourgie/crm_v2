import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuth } from '../store'

const EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']

export function useIdleTimer(timeoutMinutes, onLogout) {
  const { logout } = useAuth()
  const [showWarning, setShowWarning] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const timerRef = useRef(null)
  const warningTimerRef = useRef(null)
  const countdownRef = useRef(null)

  const reset = useCallback(() => {
    setShowWarning(false)
    setCountdown(0)
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (timerRef.current) clearTimeout(timerRef.current)

    if (!timeoutMinutes || timeoutMinutes <= 0) return

    const ms = timeoutMinutes * 60 * 1000
    const warningMs = ms - 60000

    timerRef.current = setTimeout(() => {
      setShowWarning(true)
      let remaining = 60
      setCountdown(remaining)
      countdownRef.current = setInterval(() => {
        remaining--
        setCountdown(remaining)
        if (remaining <= 0) {
          clearInterval(countdownRef.current)
        }
      }, 1000)

      warningTimerRef.current = setTimeout(() => {
        setShowWarning(false)
        if (onLogout) onLogout()
        else logout()
      }, 60000)
    }, warningMs)
  }, [timeoutMinutes, onLogout, logout])

  const stayAlive = useCallback(() => {
    setShowWarning(false)
    setCountdown(0)
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    reset()
  }, [reset])

  useEffect(() => {
    reset()
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }))
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      EVENTS.forEach(e => window.removeEventListener(e, reset))
    }
  }, [reset])

  return { showWarning, countdown, stayAlive, reset }
}
