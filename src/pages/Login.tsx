import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { CloudOff } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { isCloudEnabled } from '@/lib/supabase'
import { Logo } from '@/components/Logo'
import { Button, Card } from '@/components/ui'

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c0 1.1-.7 2.7-2.1 3.8l-.1.1 3 2.4.2.1c1.9-1.8 3-4.4 3-8.6z"
      />
      <path fill="#34A853" d="M12 24c2.9 0 5.4-1 7.1-2.6l-3.4-2.6c-.9.6-2.1 1-3.7 1-2.8 0-5.2-1.9-6.1-4.4l-3.6 2.8v.1C4.1 21.7 7.7 24 12 24z" />
      <path fill="#FBBC05" d="M5.9 15.4c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2L2.3 8.6l-.1.1C.8 10.3 0 11.9 0 13.4s.8 3.1 2.2 4.8l3.7-2.8z" />
      <path fill="#EA4335" d="M12 4.7c1.6 0 2.7.7 3.3 1.3l2.9-2.8C16.4 1.5 14.4 0 12 0 7.7 0 4.1 2.3 2.2 5.9l3.7 2.9c.9-2.5 3.3-4.1 6.1-4.1z" />
    </svg>
  )
}

export default function LoginPage() {
  const { cloudEnabled, user, loading, signInWithGoogle } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return null
  if (cloudEnabled && user) return <Navigate to="/" replace />
  if (!cloudEnabled) return <Navigate to="/" replace />

  const login = async () => {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible')
      setBusy(false)
    }
  }

  return (
    <div className="grid-bg flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Logo size={38} />
      </span>
      <Card className="w-full max-w-sm space-y-5 p-6 text-center">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Bienvenue sur VeryHevy</h1>
          <p className="mt-1 text-sm text-muted">
            Connectez-vous pour retrouver vos séances sur tous vos appareils.
          </p>
        </div>
        <Button variant="primary" size="lg" block onClick={login} disabled={busy}>
          <GoogleMark /> {busy ? 'Redirection vers Google…' : 'Se connecter avec Google'}
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
        <p className="text-[11px] text-muted">
          Vos données restent privées : chaque compte ne voit que les siennes.
        </p>
      </Card>
      {!isCloudEnabled && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <CloudOff size={13} /> Cloud non configuré — mode local uniquement.
        </p>
      )}
    </div>
  )
}
