import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { SEEDED_CREDENTIALS, mockTeamMembers } from './mock-data'
import type { TeamMember } from './types'

/** Where we store the full TeamMember object. Atlas-mode users don't exist
 *  in mockTeamMembers, so we can't rehydrate by id alone. */
const STORAGE_KEY = 'team-manager.auth.user'
/** Legacy id-only key — read on mount so existing sessions keep working;
 *  resolved against mockTeamMembers. */
const LEGACY_ID_KEY = 'team-manager.auth.userId'

export interface LoginResult {
  ok: boolean
  user: TeamMember | null
  error: string | null
}

export interface AuthStore {
  currentUser: TeamMember | null
  isAuthenticated: boolean
  isPM: boolean
  /** Mock-mode email + password login. */
  login: (email: string, password: string) => Promise<LoginResult>
  /** Atlas-mode passwordless login: the caller (LoginPage) pulls the team
   *  member list from the data store and hands the chosen one to us. */
  loginByMember: (member: TeamMember) => LoginResult
  logout: () => void
  /** Merge a patch into the current user (used when the user edits their own profile). */
  updateCurrentUser: (patch: Partial<TeamMember>) => void
}

const AuthContext = createContext<AuthStore | null>(null)

function readPersistedUser(): TeamMember | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as TeamMember
      if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
        return parsed
      }
    }
    // Legacy id-only persistence (mock-only sessions from before Atlas).
    const legacyId = window.localStorage.getItem(LEGACY_ID_KEY)
    if (legacyId) {
      return mockTeamMembers.find((m) => m.id === legacyId) ?? null
    }
    return null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(() =>
    readPersistedUser(),
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (currentUser) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser))
        // Drop the legacy id-only key so re-login can't pick up a stale id.
        window.localStorage.removeItem(LEGACY_ID_KEY)
      } else {
        window.localStorage.removeItem(STORAGE_KEY)
        window.localStorage.removeItem(LEGACY_ID_KEY)
      }
    } catch {
      // Ignore storage errors (private mode, quota, etc).
    }
  }, [currentUser])

  const login = useCallback<AuthStore['login']>(async (email, password) => {
    // Match the seeded credential table. Trim/normalize email for forgiveness.
    const normalizedEmail = email.trim().toLowerCase()
    const match = SEEDED_CREDENTIALS.find(
      (c) => c.email.toLowerCase() === normalizedEmail && c.password === password,
    )
    if (!match) {
      return { ok: false, user: null, error: 'Invalid email or password.' }
    }
    const user = mockTeamMembers.find((m) => m.id === match.userId) ?? null
    if (!user) {
      return { ok: false, user: null, error: 'Account not found.' }
    }
    setCurrentUser(user)
    return { ok: true, user, error: null }
  }, [])

  const loginByMember = useCallback<AuthStore['loginByMember']>((member) => {
    if (!member || typeof member.id !== 'string') {
      return { ok: false, user: null, error: 'No team member selected.' }
    }
    setCurrentUser(member)
    return { ok: true, user: member, error: null }
  }, [])

  const logout = useCallback<AuthStore['logout']>(() => {
    setCurrentUser(null)
  }, [])

  const updateCurrentUser = useCallback<AuthStore['updateCurrentUser']>((patch) => {
    setCurrentUser((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const value = useMemo<AuthStore>(
    () => ({
      currentUser,
      isAuthenticated: currentUser !== null,
      isPM: currentUser?.role === 'pm',
      login,
      loginByMember,
      logout,
      updateCurrentUser,
    }),
    [currentUser, login, loginByMember, logout, updateCurrentUser],
  )

  return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth(): AuthStore {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside an <AuthProvider>')
  }
  return ctx
}

/** Route to redirect to after login based on role. */
export function homePathForRole(role: TeamMember['role']): string {
  return role === 'pm' ? '/dashboard' : '/my-tasks'
}
