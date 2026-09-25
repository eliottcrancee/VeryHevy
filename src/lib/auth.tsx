import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isCloudEnabled } from './supabase'

interface AuthState {
  /** Cloud désactivé (pas de VITE_SUPABASE_*) : mode 100 % local, pas de login requis. */
  cloudEnabled: boolean
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthCtx = createContext<AuthState>({
  cloudEnabled: isCloudEnabled,
  user: null,
  session: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = getSupabase()

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error('Cloud non configuré (VITE_SUPABASE_URL manquante)')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Retour sur l'app (HashRouter : le hash est géré par Supabase via detectSessionInUrl).
        redirectTo: window.location.origin + window.location.pathname,
      },
    })
    if (error) throw error
  }, [supabase])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
  }, [supabase])

  const value = useMemo<AuthState>(
    () => ({
      cloudEnabled: isCloudEnabled,
      user: session?.user ?? null,
      session,
      loading,
      signInWithGoogle,
      signOut,
    }),
    [session, loading, signInWithGoogle, signOut],
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
