import { useState, useEffect, useCallback } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { Home, Sparkles, Settings, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useFavorites } from '../hooks/useProperties'

// ── Theme management ──────────────────────────────────────────────────────────

type ThemePref = 'light' | 'dark' | 'auto'

function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(() => {
    try { return (localStorage.getItem('leila-theme') as ThemePref) ?? 'auto' } catch { return 'auto' }
  })

  const apply = useCallback((p: ThemePref) => {
    const dark = p === 'dark' || (p === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('leila-theme', p) } catch {}
    setPref(p)
  }, [])

  useEffect(() => {
    if (pref !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle('dark', e.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [pref])

  return [pref, apply]
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>
  )
}

function MonitorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  )
}

// ── ThemeToggle ───────────────────────────────────────────────────────────────

function ThemeToggle({ pref, onChange }: { pref: ThemePref; onChange: (p: ThemePref) => void }) {
  const options: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Tema claro', icon: <SunIcon /> },
    { value: 'auto',  label: 'Seguir sistema', icon: <MonitorIcon /> },
    { value: 'dark',  label: 'Tema escuro', icon: <MoonIcon /> },
  ]
  return (
    <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-full w-fit">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          title={o.label}
          aria-label={o.label}
          className={`flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 ${
            pref === o.value
              ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  const { signOut, user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [themePref, applyTheme] = useTheme()
  const { data: favorites } = useFavorites()

  const favCount = favorites?.length ?? 0

  const navItems = [
    { to: '/', icon: Home, label: 'Imóveis', end: true, badge: null },
    { to: '/favorites', icon: Sparkles, label: 'Avaliação', end: false, badge: favCount > 0 ? favCount : null },
    { to: '/settings', icon: Settings, label: 'Configurações', end: false, badge: null },
  ]

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#0d0f13]">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white dark:bg-[#15181e] border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-700 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Leila</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-slate-600 dark:text-slate-400">
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-60
        bg-white dark:bg-[#15181e]
        border-r border-slate-100 dark:border-slate-800/80
        flex flex-col shadow-sm dark:shadow-none
        transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Brand */}
        <div className="px-5 py-5 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-none">Leila</h1>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Rastreador de Leilões</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-wider px-3 pb-2">Menu</p>
          {navItems.map(({ to, icon: Icon, label, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-slate-100 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-slate-200'
                }`
              }
            >
              <Icon size={15} />
              <span className="flex-1">{label}</span>
              {badge != null && (
                <span className="w-5 h-5 rounded-full bg-slate-800 dark:bg-slate-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Theme toggle + User + Sign out */}
        <div className="px-3 py-4 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
          {/* Theme toggle */}
          <div className="px-1 flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">Aparência</span>
            <ThemeToggle pref={themePref} onChange={applyTheme} />
          </div>

          {/* User card */}
          {user?.email && (
            <div className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-white/5">
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-none mb-0.5">Logado como</p>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate">{user.email}</p>
            </div>
          )}

          {/* Sign out */}
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 w-full transition-all duration-150"
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <Outlet />
      </main>
    </div>
  )
}
