import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AtSign } from 'lucide-react'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, Field, Input } from '@/components/ui'
import { useStore } from '@/store/store'
import { isValidUsername, normalizeUsername } from '@/types'
import { claimUsername, isUsernameAvailable } from '@/lib/social'

/**
 * Onboarding V2 : choix du pseudo unique au premier login.
 * Route publique (hors AppShell) : /bienvenue.
 */
export default function WelcomePage() {
  const navigate = useNavigate()
  const notify = useStore((s) => s.notify)
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const clean = normalizeUsername(value)
  const valid = isValidUsername(clean)

  const check = async () => {
    if (!valid) {
      setHint('3-20 caractères : minuscules, chiffres, . ou _')
      return
    }
    setChecking(true)
    setHint(null)
    try {
      const ok = await isUsernameAvailable(clean)
      setHint(ok ? `@${clean} est disponible 🎉` : `@${clean} est déjà pris`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Vérification impossible', 'error')
    } finally {
      setChecking(false)
    }
  }

  const save = async () => {
    if (!valid) return
    setSaving(true)
    try {
      await claimUsername(clean)
      notify(`Bienvenue @${clean} 💪`, 'success')
      navigate('/', { replace: true })
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Pseudo impossible', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Bienvenue 👋" subtitle="Choisis ton pseudo unique" />
      <Page className="max-w-md space-y-4 pb-10">
        <Card className="space-y-4 p-4">
          <p className="text-sm text-muted">
            C'est ce pseudo que verront tes follows sur le feed et la carte.
            Tu pourras changer ta bio et ta ville plus tard dans ton profil.
          </p>
          <Field label="Pseudo" hint="Ex. lea.lift — 3 à 20 caractères">
            <div className="relative">
              <AtSign size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void check() }}
                placeholder="ton.pseudo"
                autoComplete="off"
                className="pl-9"
              />
            </div>
          </Field>
          {hint && <p className="text-sm text-muted">{hint}</p>}
          <div className="flex gap-2">
            <Button disabled={!valid || checking} onClick={() => void check()}>
              {checking ? 'Vérification…' : 'Vérifier'}
            </Button>
            <Button variant="primary" block disabled={!valid || saving} onClick={() => void save()}>
              {saving ? 'Enregistrement…' : 'Valider mon pseudo'}
            </Button>
          </div>
        </Card>
      </Page>
    </div>
  )
}
