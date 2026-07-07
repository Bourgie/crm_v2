import { useState, useEffect } from 'react'

let rechartsModule = null
let rechartsPromise = null

export function useRecharts() {
  const [mod, setMod] = useState(rechartsModule)
  useEffect(() => {
    if (rechartsModule) return
    if (!rechartsPromise) rechartsPromise = import('recharts')
    rechartsPromise.then(m => {
      rechartsModule = m
      setMod(m)
    })
  }, [])
  return mod
}
