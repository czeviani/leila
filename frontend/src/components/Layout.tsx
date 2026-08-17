import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { BookmarkCheck, LogOut, Menu, Radar, Settings2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useFavorites } from '../hooks/useProperties'

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`brand-mark ${compact ? 'h-9 w-9' : 'h-10 w-10'}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
        <path d="M9 8.5h13.5L31 17v14.5H17.5L9 23V8.5Z" stroke="currentColor" strokeWidth="2" />
        <path d="M15 8.5V25h16.2M15 19h9.5" stroke="currentColor" strokeWidth="2" />
        <circle cx="31" cy="25" r="2.75" fill="currentColor" />
      </svg>
    </span>
  )
}

export default function Layout() {
  const { signOut, user } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { data: favorites } = useFavorites()

  const favCount = favorites?.length ?? 0
  const navItems = [
    { to: '/', icon: Radar, label: 'Radar de imóveis', end: true, badge: null },
    { to: '/favorites', icon: BookmarkCheck, label: 'Análises salvas', end: false, badge: favCount > 0 ? favCount : null },
    { to: '/settings', icon: Settings2, label: 'Preferências', end: false, badge: null },
  ]

  useEffect(() => {
    // The redesigned product currently ships as a coherent light theme. Remove
    // a legacy dark class until every decision surface has a complete dark set.
    document.documentElement.classList.remove('dark')
  }, [])

  useEffect(() => {
    if (!sidebarOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  const pageProvidesMainLandmark = location.pathname === '/' || location.pathname.startsWith('/properties/')

  return (
    <div className="leila-shell flex h-dvh overflow-hidden bg-[#f3f7f7] dark:bg-[#0d171c]">
      <a href="#main-content" className="skip-link">Ir para o conteúdo</a>

      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[#dce7e6] bg-white/95 px-4 backdrop-blur lg:hidden dark:border-white/10 dark:bg-[#112229]/95">
        <NavLink to="/" className="flex items-center gap-2.5 rounded-lg" aria-label="Leila Radar — página inicial">
          <BrandMark compact />
          <span className="font-display text-[15px] font-extrabold tracking-[-0.035em] text-[#163447] dark:text-white">
            Leila <span className="font-semibold text-[#176b87] dark:text-[#63c5cc]">Radar</span>
          </span>
        </NavLink>
        <button
          type="button"
          onClick={() => setSidebarOpen(open => !open)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#d9e4e3] text-[#294d5b] hover:bg-[#edf4f3] dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
        >
          {sidebarOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
      </header>

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-[#081419]/55 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fechar menu"
          tabIndex={-1}
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-[#dce7e6] bg-white shadow-2xl shadow-[#163447]/10 transition-transform duration-200 lg:static lg:translate-x-0 lg:shadow-none dark:border-white/10 dark:bg-[#112229] dark:shadow-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navegação principal"
      >
        <div className="border-b border-[#e4eceb] px-5 py-5 dark:border-white/10">
          <NavLink to="/" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 rounded-xl" aria-label="Leila Radar — página inicial">
            <BrandMark />
            <div className="min-w-0">
              <p className="font-display text-[17px] font-extrabold leading-none tracking-[-0.04em] text-[#163447] dark:text-white">
                Leila <span className="font-semibold text-[#176b87] dark:text-[#63c5cc]">Radar</span>
              </p>
              <p className="mt-1 text-xs font-medium text-[#607c86] dark:text-slate-400">Decisão com evidência</p>
            </div>
          </NavLink>

          <div className="provenance-line mt-5" aria-label="Da fonte à decisão">
            <span>Fonte</span><i /><span>Dado</span><i /><span>Decisão</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5" aria-label="Seções">
          <p className="px-3 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#718a92] dark:text-slate-500">Explorar</p>
          <div className="space-y-1">
            {navItems.map(({ to, icon: Icon, label, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `group flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-[#e5f1f1] text-[#0f5c64] dark:bg-[#63c5cc]/10 dark:text-[#76d1d5]'
                    : 'text-[#526f79] hover:bg-[#f0f5f4] hover:text-[#163447] dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100'
                }`}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                <span className="flex-1">{label}</span>
                {badge != null && (
                  <span className="flex min-h-6 min-w-6 items-center justify-center rounded-full bg-[#163447] px-1.5 font-mono text-[11px] font-bold text-white dark:bg-[#63c5cc] dark:text-[#112229]" aria-label={`${badge} imóveis salvos`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="border-t border-[#e4eceb] px-3 py-4 dark:border-white/10">
          {user?.email && (
            <div className="mb-2 rounded-xl border border-[#e1eae9] bg-[#f6f9f8] px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-xs font-medium text-[#718a92] dark:text-slate-500">Conta</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-[#294d5b] dark:text-slate-200">{user.email}</p>
            </div>
          )}

          <button
            type="button"
            onClick={signOut}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#607c86] transition-colors hover:bg-red-50 hover:text-[#9c3040] dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
          >
            <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
            Sair da conta
          </button>
        </div>
      </aside>

      <div
        id="main-content"
        className="min-w-0 flex-1 overflow-y-auto pt-16 lg:pt-0"
        tabIndex={-1}
        role={pageProvidesMainLandmark ? undefined : 'main'}
      >
        <Outlet />
      </div>
    </div>
  )
}
