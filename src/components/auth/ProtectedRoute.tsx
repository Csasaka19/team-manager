import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { homePathForRole, useAuth } from '@/data/auth'

interface ProtectedRouteProps {
  /** When true, only Project Managers may pass. Members are redirected with a toast. */
  requirePM?: boolean
  /** Optional single child — when omitted, renders an <Outlet /> for layout-route usage. */
  children?: ReactNode
}

export function ProtectedRoute({ requirePM = false, children }: ProtectedRouteProps) {
  const { currentUser, isAuthenticated, isPM } = useAuth()
  const location = useLocation()

  const memberHitPmRoute = isAuthenticated && requirePM && !isPM

  useEffect(() => {
    if (memberHitPmRoute) {
      toast.error("You don't have access to that page.")
    }
  }, [memberHitPmRoute])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (memberHitPmRoute && currentUser) {
    return <Navigate to={homePathForRole(currentUser.role)} replace />
  }

  return children ? <>{children}</> : <Outlet />
}
