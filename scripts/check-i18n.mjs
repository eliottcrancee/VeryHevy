/**
 * Vérifie la cohérence des dictionnaires FR/EN et repère les clés mortes.
 *
 * - Parité : toute clé doit exister dans les deux langues (sinon échec).
 * - Clés mortes : clé jamais citée dans `src/` (hors i18n.ts). Les namespaces
 *   utilisés dynamiquement via `tx(prefix, value)` sont ignorés.
 *
 * Usage : npm run test:i18n
 */
import fs from 'node:fs'
import path from 'node:path'

/** Namespaces lus dynamiquement (voir `tx()` dans i18n.ts). */
const DYNAMIC_PREFIXES = ['cat', 'track', 'set', 'level', 'muscle', 'equip']

const source = fs.readFileSync('src/lib/i18n.ts', 'utf8')
const cut = source.indexOf('const en: Dict')
if (cut < 0) {
  console.error('Impossible de séparer les dictionnaires fr / en.')
  process.exit(1)
}
const keysOf = (text) =>
  [...text.matchAll(/^\s*'((?:[^'\\]|\\.)+)':/gm)].map((m) => m[1])

const frKeys = keysOf(source.slice(0, cut))
const enKeys = keysOf(source.slice(cut))
const fr = new Set(frKeys)
const en = new Set(enKeys)

const missingEn = frKeys.filter((k) => !en.has(k))
const missingFr = enKeys.filter((k) => !fr.has(k))

const files = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(entry.name) && p !== 'src/lib/i18n.ts') files.push(p)
  }
}
walk('src')
const used = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')

const dead = frKeys.filter((key) => {
  const prefix = key.split('.')[0]
  if (DYNAMIC_PREFIXES.includes(prefix)) return false
  return !used.includes(`'${key}'`) && !used.includes(`"${key}"`) && !used.includes(`\`${key}\``)
})

console.log(`Clés FR : ${frKeys.length} · Clés EN : ${enKeys.length}`)
if (missingEn.length) console.error(`Manquantes en EN : ${missingEn.join(', ')}`)
if (missingFr.length) console.error(`Manquantes en FR : ${missingFr.join(', ')}`)
if (dead.length) console.log(`Clés mortes (${dead.length}) :\n- ${dead.join('\n- ')}`)

if (missingEn.length || missingFr.length) process.exit(1)
console.log('Parité FR/EN OK.')