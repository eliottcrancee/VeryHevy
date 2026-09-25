import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AtSign } from 'lucide-react'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, Field, Input, Segmented } from '@/components/ui'
import { useStore } from '@/store/store'
import { isValidUsername, normalizeUsername } from '@/types'
import { claimUsername, isUsernameAvailable } from '@/lib/social'
import { applyLangAttr, detectLang, t, useLang, type Lang } from '@/lib/i18n'

/**
 * Onboarding : langue puis pseudo unique au premier login.
 * Route publique (hors AppShell) : /bienvenue.
 */
export default function WelcomePage() {
  const navigate = useNavigate()
  const notify = useStore((s) => s.notify)
  const updateSettings = useStore((s) => s.updateSettings)
  useLang()
  const [langChoice, setLangChoice] = useState<Lang>(() => detectLang())
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const pickLang = (l: Lang) => {
    setLangChoice(l)
    updateSettings({ lang: l })
    applyLangAttr(l)
  }

  /* Première connexion : on part sur la langue du navigateur, l'utilisateur
     peut changer juste en dessous. */
  useEffect(() => {
    const detected = detectLang()
    if (detected !== 'fr') pickLang(detected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      <PageHeader title={t('welcome.title')} subtitle={t('welcome.username')} />
      <Page className="max-w-md space-y-4 pb-10">
        <Card className="space-y-2 p-4">
          <p className="text-sm font-bold">{t('welcome.language')}</p>
          <Segmented
            value={langChoice}
            onChange={(v) => pickLang(v as Lang)}
            options={[
              { value: 'fr', label: `🇫🇷 ${t('lang.fr')}` },
              { value: 'en', label: `🇬🇧 ${t('lang.en')}` },
            ]}
          />
        </Card>
        <Card className="space-y-4 p-4">
          <p className="text-sm text-muted">
            {t('welcome.feedHint')}{' '}{t('welcome.bioHint')}
          </p>
          <Field label={t('welcome.username')} hint={t('welcome.usernameHint')}>
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
              {checking ? t('welcome.checking') : t('welcome.check')}
            </Button>
            <Button variant="primary" block disabled={!valid || saving} onClick={() => void save()}>
              {saving ? t('common.loading') : t('welcome.start')}
            </Button>
          </div>
        </Card>
      </Page>
    </div>
  )
}
