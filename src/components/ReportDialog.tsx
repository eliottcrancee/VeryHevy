import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/store/store'
import { t, useLang } from '@/lib/i18n'
import { Button, Field, Modal, Select, Textarea } from './ui'

export type ReportTarget = 'profile' | 'post' | 'session'

export function ReportDialog({ open, targetType, targetId, onClose }: {
  open: boolean
  targetType: ReportTarget
  targetId: string
  onClose: () => void
}) {
  const notify = useStore((s) => s.notify)
  useLang()
  const [reason, setReason] = useState('spam')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const sb = getSupabase()
    const { data: { user } } = await sb!.auth.getUser()
    if (!user) { notify(t('lib.reportLogin'), 'error'); return }
    setBusy(true)
    try {
      const { error } = await sb!.from('reports').insert({
        reporter: user.id, target_type: targetType, target_id: targetId,
        reason: `${reason}${details.trim() ? ` : ${details.trim()}` : ''}`.slice(0, 500),
      })
      if (error) throw error
      notify(t('lib.reportSent'), 'success')
      setDetails('')
      onClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : t('lib.reportFailed'), 'error')
    } finally { setBusy(false) }
  }

  return <Modal open={open} onClose={onClose} title={t('lib.reportTitle')}>
    <div className="space-y-3">
      <p className="text-sm text-muted">{t('lib.reportHint')}</p>
      <Field label={t('lib.reportReason')}><Select value={reason} onChange={(e) => setReason(e.target.value)}>
        <option value="spam">{t('lib.reportSpam')}</option>
        <option value="harcèlement">{t('lib.reportHarass')}</option>
        <option value="contenu inapproprié">{t('lib.reportInappro')}</option>
        <option value="faux profil">{t('lib.reportFake')}</option>
        <option value="autre">{t('lib.reportOther')}</option>
      </Select></Field>
      <Field label={t('lib.reportDetails')}><Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={450} rows={3} /></Field>
      <div className="flex gap-2">
        <Button block variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button block variant="primary" disabled={busy} onClick={() => void submit()}>{busy ? t('lib.sending') : t('common.send')}</Button>
      </div>
    </div>
  </Modal>
}
