import { Menu, Search } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useData } from '@/data/store'
import { DataSourceBadge } from './DataSourceBadge'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'

interface TopBarProps {
  onMobileMenuClick: () => void
  onSearchClick: () => void
}

export function TopBar({ onMobileMenuClick, onSearchClick }: TopBarProps) {
  const { workspaceName } = useData()
  return (
    <header
      className="fixed inset-x-0 top-0 z-20 h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] md:left-16 lg:left-60"
      role="banner"
    >
      <div className="flex h-full items-center justify-between gap-2 px-3 md:gap-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={onMobileMenuClick}
            className="-ml-1 inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="truncate font-semibold text-[15px] text-[var(--text-primary)]">
            {workspaceName}
          </span>
          <DataSourceBadge />
        </div>

        <div className="flex shrink-0 items-center gap-0.5 md:gap-1">
          <button
            type="button"
            onClick={onSearchClick}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] md:h-9 md:w-9 lg:w-auto lg:gap-2 lg:px-2"
            aria-label="Search"
            title="Search (Ctrl+K)"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
            <kbd className="hidden rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1 py-0.5 text-[10px] font-medium uppercase tracking-[0.5px] lg:inline-flex">
              ⌘K
            </kbd>
          </button>
          <ThemeToggle />
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
