import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SearchModal } from '@/components/search/SearchModal'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()

  // Close mobile drawer when the route changes.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Cmd+K / Ctrl+K opens the global search.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <TopBar
        onMobileMenuClick={() => setMobileOpen(true)}
        onSearchClick={() => setSearchOpen(true)}
      />

      <main className="md:pl-16 lg:pl-60 pt-14">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
          <Outlet />
        </div>
      </main>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
