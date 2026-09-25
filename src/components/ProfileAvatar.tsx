import { Link } from 'react-router-dom'
import type { SocialProfile } from '@/types'

/** Lien vers le profil public (/profil/:username), ou null sans pseudo. */
export function profileLinkOf(p?: SocialProfile | null): string | null {
  return p?.username ? `/profil/${p.username}` : null
}

/** Nom d'affichage : nom, sinon @pseudo, sinon repli. */
export function profileNameOf(p?: SocialProfile | null, fallback = 'Sportif'): string {
  return p?.display_name?.trim() || (p?.username ? `@${p.username}` : fallback)
}

/** Photo de profil ronde (ou initiale). */
export function ProfileAvatar({ url, name, size = 32 }: {
  url?: string | null
  name: string
  size?: number
}) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-extrabold text-accent"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

/**
 * Ligne profil standard : photo ronde + nom + @pseudo, cliquable vers
 * le profil quand le pseudo est connu.
 */
export function ProfileLine({ profile, size = 28, single }: {
  profile?: SocialProfile | null
  size?: number
  /** Une seule ligne (nom uniquement) au lieu de nom + pseudo. */
  single?: boolean
}) {
  const name = profileNameOf(profile)
  const to = profileLinkOf(profile)
  const body = (
    <>
      <ProfileAvatar url={profile?.avatar_url} name={name} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold">{name}</span>
        {!single && profile?.username && profile.display_name && (
          <span className="block truncate text-[11px] text-muted">@{profile.username}</span>
        )}
      </span>
    </>
  )
  if (to) {
    return (
      <Link to={to} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {body}
      </Link>
    )
  }
  return <span className="flex min-w-0 flex-1 items-center gap-2">{body}</span>
}
