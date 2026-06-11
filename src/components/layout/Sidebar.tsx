import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Columns3,
  CheckSquare,
  FolderOpen,
  CalendarRange,
  Radio,
  Users,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/data/auth'
import { cn } from '@/lib/utils'

interface SidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const dashboardItem: NavItem = { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }

const sharedItems: NavItem[] = [
  { to: '/board', label: 'Board', icon: Columns3 },
  { to: '/my-tasks', label: 'My Tasks', icon: CheckSquare },
  { to: '/projects', label: 'Projects', icon: FolderOpen },
  { to: '/meetings', label: 'Meetings', icon: CalendarRange },
  { to: '/atlas', label: 'Atlas', icon: Radio },
  { to: '/team', label: 'Team', icon: Users },
]

const settingsItem: NavItem = { to: '/settings', label: 'Settings', icon: Settings }

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const { isPM } = useAuth()
  const primaryItems: NavItem[] = isPM ? [dashboardItem, ...sharedItems] : sharedItems
  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onMobileClose}
        className={cn(
          'fixed inset-0 z-30 bg-black/60 transition-opacity md:hidden',
          mobileOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col',
          'bg-[var(--bg-surface)] border-r border-[var(--border-subtle)]',
          'transition-[transform,width] duration-200 ease-out',
          // Mobile (<768): hidden overlay
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Tablet (>=768): visible, 64px icons-only
          'md:translate-x-0 md:w-16',
          // Desktop (>=1024): full 240px
          'lg:w-60',
          // Mobile width (when shown as overlay)
          'w-60',
        )}
        aria-label="Primary navigation"
      >
        <div className="flex h-14 items-center justify-center border-b border-[var(--border-subtle)] md:justify-center lg:justify-start lg:px-6">
          <span className="font-semibold text-[15px] text-[var(--text-primary)] md:hidden lg:inline">
            Team Manager
          </span>
          <span className="hidden md:inline lg:hidden text-[var(--accent-primary)] font-semibold">
            TM
          </span>
        </div>

        <nav data-tour="sidebar" className="flex-1 overflow-y-auto py-3">
          <ul className="space-y-1 px-2">
            {primaryItems.map((item) => (
              <li key={item.to}>
                <NavItemLink item={item} onNavigate={onMobileClose} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-[var(--border-subtle)] p-2">
          <NavItemLink item={settingsItem} onNavigate={onMobileClose} />
        </div>
      </aside>
    </>
  )
}

interface NavItemLinkProps {
  item: NavItem
  onNavigate: () => void
}

function NavItemLink({ item, onNavigate }: NavItemLinkProps) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium',
          'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
          // Icon-only mode (md, not lg): center the icon
          'md:justify-center md:px-2 md:py-2 lg:justify-start lg:px-3 lg:py-2',
          isActive &&
            'bg-[var(--bg-elevated)] text-[var(--text-primary)] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-r before:bg-[var(--accent-primary)]',
        )
      }
      end
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="md:hidden lg:inline">{item.label}</span>
    </NavLink>
  )
}
