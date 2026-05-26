import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { homePathForRole, useAuth } from '@/data/auth'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import BoardPage from '@/pages/BoardPage'
import MyTasksPage from '@/pages/MyTasksPage'
import TaskDetailPage from '@/pages/TaskDetailPage'
import ProjectsPage from '@/pages/ProjectsPage'
import TeamPage from '@/pages/TeamPage'
import SettingsPage from '@/pages/SettingsPage'
import NotFoundPage from '@/pages/NotFoundPage'

function RoleHome() {
  const { currentUser } = useAuth()
  // ProtectedRoute guarantees currentUser is set at this point.
  return <Navigate to={homePathForRole(currentUser?.role ?? 'member')} replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<RoleHome />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requirePM>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/my-tasks" element={<MyTasksPage />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
