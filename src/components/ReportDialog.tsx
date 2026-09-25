import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/store/store'
import { Button, Field, Modal, Select, Textarea } from './ui'

export type ReportTarget = 'profile' | 'post' | 'session'

export function ReportDialog({ open, targetType, targetId, onClose }: {
  open: boolean
  targetType: ReportTarget
  targetId: string
  onClose: () => void
}) {
  const notify = useStore((s) => s.notify)
  const [reason, setReason] = useState('spam')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const sb = getSupabase()
    const { data: { user } } = await sb!.auth.getUser()
    if (!user) { notify('Connecte-toi pour signaler', 'error'); return }
    setBusy(true)
    try {
      const { error } = await sb!.from('reports').insert({
        reporter: user.id, target_type: targetType, target_id: targetId,
        reason: `${reason}${details.trim() ? ` : ${details.trim()}` : ''}`.slice(0, 500),
      })
      if (error) throw error
      notify('Signalement transmis', 'success')
      setDetails('')
      onClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Signalement impossible', 'error')
    } finally { setBusy(false) }
  }

  return <Modal open={open} onClose={onClose} title="Signaler ce contenu">
    <div className="space-y-3">
      <p className="text-sm text-muted">Indique ce qui pose problème pour faciliter la modération.</p>
      <Field label="Motif"><Select value={reason} onChange={(e) => setReason(e.target.value)}>
        <option value="spam">Spam ou publicité</option>
        <option value="harcèlement">Harcèlement</option>
        <option value="contenu inapproprié">Contenu inapproprié</option>
        <option value="faux profil">Faux profil</option>
        <option value="autre">Autre</option>
      </Select></Field>
      <Field label="Précisions (facultatif)"><Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={450} rows={3} /></Field>
      <div className="flex gap-2">
        <Button block variant="ghost" onClick={onClose}>Annuler</Button>
        <Button block variant="primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Envoi…' : 'Envoyer'}</Button>
      </div>
    </div>
  </Modal>
}
