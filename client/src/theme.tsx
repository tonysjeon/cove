import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null)

type Theme = 'light' | 'dark'
const storageKey = 'cove:theme'
function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(storageKey)
    return value === 'light' || value === 'dark' ? value : null
  } catch { return null }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useRef(savedTheme())
  const [theme, setTheme] = useState<Theme>(() => preference.current ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)')
    const syncSystem = () => { if (!preference.current) setTheme(system.matches ? 'dark' : 'light') }
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return
      preference.current = savedTheme()
      setTheme(preference.current ?? (system.matches ? 'dark' : 'light'))
    }
    system.addEventListener('change', syncSystem)
    window.addEventListener('storage', syncStorage)
    return () => { system.removeEventListener('change', syncSystem); window.removeEventListener('storage', syncStorage) }
  }, [])

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light'
    preference.current = next
    setTheme(next)
    try { localStorage.setItem(storageKey, next) } catch { /* The theme still works when storage is unavailable. */ }
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("Theme controls require ThemeProvider")
  return context
}
