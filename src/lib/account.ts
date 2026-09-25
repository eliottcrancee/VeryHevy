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

function sbOrThrow() {
  const sb = getSupabase()
  if (!sb) throw new Error('Cloud non configuré')
  return sb
}

async function wipeTable(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  table: string,
  match: Record<string, string>,
): Promise<void> {
  const { error } = await sb.from(table).delete().match(match)
  if (error) throw new Error(`${table} : ${error.message}`)
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
  if (!me) throw new Error('Non connecté')

  // 1. Messages (envoyés ou reçus) — policy "message delete participant".
  const { error: mErr } = await sb.from('messages').delete().or(`from_id.eq.${me},to_id.eq.${me}`)
  if (mErr) throw new Error(`messages : ${mErr.message}`)

  // 2. Notifications reçues.
  await wipeTable(sb, 'notifications', { user_id: me })

  // 3. Inscriptions à des sorties d'autres hôtes.
  await wipeTable(sb, 'session_joins', { user_id: me })

  // 4. Follows + demandes (deux sens).
  await wipeTable(sb, 'follows', { follower: me })
  await wipeTable(sb, 'follows', { followed: me })
  await wipeTable(sb, 'follow_requests', { requester: me })
  await wipeTable(sb, 'follow_requests', { target: me })

  // 5. Posts (cascade likes/commentaires) puis sorties créées
  //    (cascade inscrits/demandes/invitations).
  await wipeTable(sb, 'posts', { user_id: me })
  await wipeTable(sb, 'sessions', { host: me })

  // 6. Blocs posés.
  await wipeTable(sb, 'blocks', { blocker: me })

  // 7. Données d'entraînement synchronisées.
  for (const table of ['workouts', 'routines', 'exercises', 'deleted_items'] as const) {
    await wipeTable(sb, table, { user_id: me })
  }

  // 8. Profil.
  await wipeTable(sb, 'profiles', { id: me })

  // 9. Fichiers (best effort).
  await wipeStoragePrefix(sb, 'avatars', me)
  await wipeStoragePrefix(sb, 'post-photos', me)
}
