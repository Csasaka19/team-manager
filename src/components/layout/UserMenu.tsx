import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Settings as SettingsIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/data/auth'
import type { TeamMember } from '@/data/types'
import { cn } from '@/lib/utils'

/** Project-palette colors from the design brief — same set used for project dots. */
const AVATAR_COLORS = [
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#A855F7',
  '#EC4899',
  '#14B8A6',
  '#F97316',
] as const

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function colorFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]!
}

export function UserMenu() {
  const { currentUser, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        menuRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!currentUser) return null

  const initials = initialsFor(currentUser.name)
  const bg = colorFor(currentUser.name)

  function handleLogout() {
    setOpen(false)
    logout()
    toast.success('Logged out.')
    navigate('/login', { replace: true })
  }

  function handleSettings() {
    setOpen(false)
    navigate('/settings')
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${currentUser.name}`}
        className="ml-1 inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none md:ml-2 md:h-8 md:w-8"
      >
        <span
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-[var(--text-inverse)]',
            'ring-offset-2 ring-offset-[var(--bg-surface)] transition-shadow',
            open && 'ring-2 ring-[var(--accent-primary)]',
          )}
          style={{ backgroundColor: bg }}
        >
          {initials}
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        >
          <UserHeader user={currentUser} />
          <div className="h-px bg-[var(--border-subtle)]" />
          <MenuItem icon={SettingsIcon} label="Settings" onSelect={handleSettings} />
          <MenuItem
            icon={LogOut}
            label="Log out"
            onSelect={handleLogout}
            destructive
          />
        </div>
      )}
    </div>
  )
}

function UserHeader({ user }: { user: TeamMember }) {
  return (
    <div className="px-3 py-2.5">
      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
        {user.name}
      </p>
      <p className="truncate text-xs text-[var(--text-secondary)]">{user.email}</p>
    </div>
  )
}

interface MenuItemProps {
  icon: typeof SettingsIcon
  label: string
  onSelect: () => void
  destructive?: boolean
}

function MenuItem({ icon: Icon, label, onSelect, destructive = false }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
        'text-[var(--text-primary)] hover:bg-[var(--bg-surface)]',
        destructive && 'text-[var(--destructive)] hover:bg-[var(--destructive)]/10',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {label}
    </button>
  )
}
