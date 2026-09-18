import { useEffect, useState } from 'react'
import { useStore } from '@/store/store'

/* ------------------------------------------------------------------ */
/* Manifest dynamique : en PWA installée, Android peint la barre de    */
/* statut ET la barre des boutons système (retour / home / applis)     */
/* avec `theme_color` / `background_color` du manifest — en ignorant    */
/* la balise meta. Le manifest statique est figé en sombre : on le     */
/* régénère ici aux couleurs du thème pour que les boutons système     */
/* suivent (blanc en clair, noir en sombre).                           */
/* ------------------------------------------------------------------ */

let manifestTemplate: string | null = null
let manifestUrl: string | null = null

async function syncManifestTheme(dark: boolean) {
  try {
    if (!manifestTemplate) {
      const res = await fetch('./manifest.webmanifest', { cache: 'no-cache' })
      if (!res.ok) return
      manifestTemplate = await res.text()
    }
    const color = dark ? '#0a0b0f' : '#f3f4f7'
    const json = JSON.parse(manifestTemplate) as Record<string, unknown>
    json.theme_color = color
    json.background_color = color
    if (manifestUrl) URL.revokeObjectURL(manifestUrl)
    manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: 'application/manifest+json' }))
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', manifestUrl)
  } catch {
    /* manifest statique conservé */
  }
}

export function useThemeEffect() {
  const theme = useStore((s) => s.settings.theme)
  const accent = useStore((s) => s.settings.accent)

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const dark = theme === 'dark' || (theme === 'system' && prefersDark)
      root.classList.toggle('dark', dark)
      const meta = document.querySelector('meta[name="theme-color"]')
      meta?.setAttribute('content', dark ? '#0a0b0f' : '#f3f4f7')
      void syncManifestTheme(dark)
    }
    apply()
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-user', accent)
  }, [accent])
}

/** Empêche la mise en veille de l'écran pendant une séance. */
export function useWakeLock(active: boolean) {
  const enabled = useStore((s) => s.settings.keepAwake)
  useEffect(() => {
    if (!active || !enabled) return
    let sentinel: { release: () => Promise<void> } | null = null
    let cancelled = false

    const request = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
        }
        if (!nav.wakeLock) return
        sentinel = await nav.wakeLock.request('screen')
        if (cancelled) void sentinel.release()
      } catch {
        /* refusé ou non supporté */
      }
    }

    void request()
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) void request()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release()
      sentinel = null
    }
  }, [active, enabled])
}

/**
 * Publie la hauteur d'une barre d'action fixe appartenant à une page dans la
 * variable `--bottom-bar`.`. Le contenu, le chrono de repos et les toasts
 * s'empilent ainsi au-dessus d'elle, exactement comme au-dessus de la
 * navigation mobile (`--bottom-stack`).
 */
export function useBottomBar() {
  const [el, setEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const root = document.documentElement
    if (!el) {
      root.style.setProperty('--bottom-bar', '0px')
      return
    }
    const update = () =>
      root.style.setProperty('--bottom-bar', `${Math.round(el.getBoundingClientRect().height)}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      root.style.setProperty('--bottom-bar', '0px')
    }
  }, [el])

  return setEl
}

/** Re-render régulier (pour les chronos). */
export function useInterval(callback: () => void, delay: number | null) {
  useEffect(() => {
    if (delay === null) return
    const id = setInterval(callback, delay)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay])
}