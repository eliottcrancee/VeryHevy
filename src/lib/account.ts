/**
 * Suppression de compte : efface TOUTES les lignes cloud de l'utilisateur
 * (entraînement + social), ses fichiers Storage, puis réinitialise
 * l'appareil. Idempotent : ré-exécutable après un échec partiel.
 *
 * Limites honnêtes : les notifs déjà envoyées aux autres et les signalements
 * restent (sans auteur identifiable) ; la ligne auth.users elle-même n'est
 * pas effaçable côté client (re-connexion Google recréerait un profil vide).
 */
import { getSupabase } from './supabase'
import { t } from './i18n'

function sbOrThrow() {
  const sb = getSupabase()
  if (!sb) throw new Error(t('lib.cloudOff'))
  return sb
}

async function wipeTable(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  table: string,
  match: Record<string, string>,
): Promise<void> {
  const { error } = await sb.from(table).delete().match(match)
  if (error) throw new Error(t('lib.wipeError', { table, msg: error.message }))
}

async function wipeStoragePrefix(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  bucket: string,
  prefix: string,
): Promise<void> {
  try {
    const { data, error } = await sb.storage.from(bucket).list(prefix)
    if (error || !data?.length) return
    const paths = data
      .filter((f) => f.name && !f.name.startsWith('.'))
      .map((f) => `${prefix}/${f.name}`)
    if (!paths.length) return
    await sb.storage.from(bucket).remove(paths)
  } catch {
    /* best effort : les fichiers orphelins ne bloquent pas la suppression */
  }
}

export async function deleteAccountEverywhere(): Promise<void> {
  const sb = sbOrThrow()
  const { data: { session } } = await sb.auth.getSession()
  const me = session?.user?.id
  if (!me) throw new Error(t('lib.notConnected'))

  // Une table refusée (policy ou GRANT manquant) ne doit pas bloquer le reste :
  // on tente TOUT, puis on rapporte précisément ce qui a résisté. La fonction
  // reste idempotente, donc relançable après avoir appliqué le correctif SQL.
  const failures: string[] = []
  const wipe = async (table: string, match: Record<string, string>) => {
    try {
      await wipeTable(sb, table, match)
    } catch (err) {
      failures.push(err instanceof Error ? err.message : table)
    }
  }

  // 1. Messages (envoyés ou reçus) — policy "message delete participant".
  const { error: mErr } = await sb.from('messages').delete().or(`from_id.eq.${me},to_id.eq.${me}`)
  if (mErr) failures.push(t('lib.wipeMessages', { msg: mErr.message }))

  // 2. Notifications reçues.
  await wipe('notifications', { user_id: me })

  // 3. Sorties : mes inscriptions, candidatures et invitations, puis celles
  //    que j'organise (cascade inscrits/candidatures/invitations).
  await wipe('session_joins', { user_id: me })
  await wipe('session_requests', { user_id: me })
  await wipe('session_invites', { user_id: me })
  await wipe('sessions', { host: me })

  // 4. Follows + demandes (dans les deux sens).
  await wipe('follows', { follower: me })
  await wipe('follows', { followed: me })
  await wipe('follow_requests', { requester: me })
  await wipe('follow_requests', { target: me })

  // 5. Mes likes et commentaires sur les posts des autres.
  await wipe('post_likes', { user_id: me })
  await wipe('post_comments', { user_id: me })

  // 6. Mes posts (cascade likes/commentaires attachés au post).
  await wipe('posts', { user_id: me })

  // 7. Blocs posés et signalements déposés.
  await wipe('blocks', { blocker: me })
  await wipe('reports', { reporter: me })

  // 8. Données d'entraînement synchronisées.
  for (const table of ['workouts', 'routines', 'exercises', 'deleted_items'] as const) {
    await wipe(table, { user_id: me })
  }

  // 9. Profil.
  await wipe('profiles', { id: me })

  // 10. Fichiers (best effort : les orphelins ne bloquent pas la suppression).
  await wipeStoragePrefix(sb, 'avatars', me)
  await wipeStoragePrefix(sb, 'post-photos', me)

  if (failures.length) throw new Error(t('lib.wipePartial', { list: failures.join(' · ') }))
}
