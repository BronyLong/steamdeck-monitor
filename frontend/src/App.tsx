import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { getSession, login, logout } from './api/auth'
import type { Credentials, User } from './api/auth'
import { SESSION_EXPIRED_EVENT } from './api/client'
import CurrentPage from './pages/CurrentPage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const controller = new AbortController()
    const expire = () => setUser(null)
    window.addEventListener(SESSION_EXPIRED_EVENT, expire)

    async function checkSession() {
      try {
        const user = await getSession(controller.signal)
        if (!controller.signal.aborted) setUser(user)
      } catch (error) {
        if (!controller.signal.aborted) {
          setSessionError(error instanceof Error ? error.message : 'Не удалось проверить сессию.')
        }
      } finally {
        if (!controller.signal.aborted) setChecking(false)
      }
    }

    void checkSession()
    return () => {
      controller.abort()
      window.removeEventListener(SESSION_EXPIRED_EVENT, expire)
    }
  }, [])

  async function signIn(credentials: Credentials, signal: AbortSignal) {
    const user = await login(credentials, signal)
    if (signal.aborted) return
    setUser(user)
    setSessionError(null)
  }

  async function signOut() {
    await logout()
    setUser(null)
    navigate('/login', { replace: true })
  }

  if (checking) {
    return <main className="flex items-center justify-center min-h-page p-6" role="status">Проверка сессии…</main>
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route element={user ? <Outlet context={{ logout: signOut }} /> : <Navigate to="/login" replace state={{ from: location.pathname }} />}>
        <Route path="/current" element={<CurrentPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Route>
      <Route path="/login" element={user ? <Navigate to={location.state?.from === '/history' ? '/history' : '/current'} replace /> : <LoginPage onLogin={signIn} sessionError={sessionError} />} />
    </Routes>
  )
}

export default App
