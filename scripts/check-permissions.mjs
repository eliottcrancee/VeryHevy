/**
 * Vérifie les permissions attendues par le client Supabase, HORS LIGNE.
 *
 *   node scripts/check-permissions.mjs
 *
 * Le script relit les `supabase/*.sql` dans leur ordre d'application, simule
 * les `revoke` / `grant` (listes de colonnes incluses) et les
 * `create`/`drop policy`, puis compare avec les appels réellement faits
 * dans `src/` :
 *
 * - `.from(t).delete()`      → GRANT `delete` + policy `for delete` (ou all) ;
 * - `.from(t).update({...})` → GRANT `update` couvrant TOUTES les colonnes ;
 * - `.from(t).insert({...})` → GRANT `insert` couvrant TOUTES les colonnes ;
 * - `.from(t).upsert({...})` → les deux ;
 * - `.from(t).select('*')`   → GRANT `select` non restreint en colonnes.
 *
 * Historique : `photo_url` manquait dans le GRANT update de `posts` (édition
 * d'une photo → « permission denied ») et `reports` n'avait aucune policy de
 * suppression (suppression de compte incomplète). Ces deux cas sont couverts.
 */
import fs from 'node:fs'
import path from 'node:path'

/* --------------------------- ordre d'application --------------------------- */

const SQL_ORDER = [
  'schema.sql',
  'schema_social.sql',
  'schema_chat.sql',
  'schema_fix_policies.sql',
  'schema_follow_requests.sql',
  'schema_blocks.sql',
  'schema_post_snapshot.sql',
  'schema_session_types.sql',
  'schema_dm.sql',
  'migrate_steps_5_to_10.sql',
  'schema_prod_hardening.sql',
  'schema_account.sql',
  'schema_followers_access.sql',
  'schema_shared_profile.sql',
  'schema_permissions_fix.sql',
]

const SQL_DIR = 'supabase'
const sqlFiles = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))
const ordered = [
  ...SQL_ORDER.filter((f) => sqlFiles.includes(f)),
  ...sqlFiles.filter((f) => !SQL_ORDER.includes(f)).sort(),
]

const PRIVS = ['select', 'insert', 'update', 'delete']

/** Découpe un texte SQL en instructions (fin sur `;` hors chaîne/commentaire). */
function statements(text) {
  const out = []
  let current = ''
  let quote = null
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quote) {
      current += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      current += ch
      continue
    }
    if (ch === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') i += 1
      continue
    }
    if (ch === ';') {
      out.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) out.push(current.trim())
  return out
}

/** Simule GRANT/REVOKE + policies de tous les fichiers, dans l'ordre. */
function buildCatalog() {
  /** table → { select, insert, update, delete } : false | true | Set(cols) */
  const privs = new Map()
  /** table → Map(nom de policy → commande) */
  const policies = new Map()
  /** policies Storage : { cmd, buckets } */
  const storagePolicies = []

  const ensure = (table) => {
    // Défaut Supabase : `authenticated` a tous les droits sur `public` ; les
    // fichiers SQL ne font que RÉVOQUER (puis re-grant ciblé).
    if (!privs.has(table)) privs.set(table, Object.fromEntries(PRIVS.map((p) => [p, true])))
    if (!policies.has(table)) policies.set(table, new Map())
    return privs.get(table)
  }

  for (const file of ordered) {
    const text = fs.readFileSync(path.join(SQL_DIR, file), 'utf8')
    for (const sql of statements(text)) {
      const flat = sql.replace(/\s+/g, ' ')

      const grant = flat.match(/^(revoke|grant)\s+(all|[\w\s,()]*?)\s+on\s+public\.(\w+)\s+(?:from|to)\s+([\w\s,."']+)$/i)
      if (grant) {
        const [, verb, rawPrivs, table, targets] = grant
        const p = ensure(table)
        const target = targets.toLowerCase()
        const applies =
          verb.toLowerCase() === 'revoke' ||
          target.includes('authenticated') ||
          target.includes('public') ||
          target.includes('all')
        if (!applies) continue
        const lower = rawPrivs.toLowerCase()
        const list = lower.includes('all') ? PRIVS : PRIVS.filter((x) => new RegExp(`\\b${x}\\b`).test(lower))
        const cols = rawPrivs.match(/\(([^)]*)\)/)
        const columnList = cols ? cols[1].split(',').map((c) => c.trim()).filter(Boolean) : null
        for (const priv of list) {
          if (verb.toLowerCase() === 'revoke') p[priv] = false
          else if (!columnList) p[priv] = true
          else if (!p[priv]) p[priv] = new Set(columnList)
          else if (p[priv] instanceof Set) columnList.forEach((c) => p[priv].add(c))
        }
        continue
      }

      const drop = flat.match(/^drop policy (?:if exists )?"?([^"]+?)"? on (public\.\w+|storage\.objects)/i)
      if (drop) {
        if (drop[2] !== 'storage.objects') {
          const table = drop[2].replace('public.', '')
          ensure(table)
          policies.get(table).delete(drop[1])
        }
        continue
      }

      const create = flat.match(/^create policy "?([^"]+?)"? on (public\.(\w+)|storage\.objects)(.*)$/i)
      if (create) {
        const cmdRaw = (create[4].match(/\bfor\s+(select|insert|update|delete|all)\b/i)?.[1] ?? 'all').toLowerCase()
        if (create[2] === 'storage.objects') {
          const buckets = [...create[4].matchAll(/bucket_id\s*=\s*'([^']+)'/g)].map((x) => x[1])
          storagePolicies.push({ cmd: cmdRaw, buckets, file })
        } else {
          ensure(create[3])
          policies.get(create[3]).set(create[1], cmdRaw)
        }
      }
    }
  }
  return { privs, policies, storagePolicies }
}

/* ------------------------- lecture du code client ------------------------- */

/** Contenu d'un littéral `{...}` (fin sur l'accolade fermante de niveau 0). */
function topLevelSlice(src, openIndex) {
  if (src[openIndex] !== '{') return null
  let depth = 0
  let quote = null
  for (let i = openIndex; i < src.length; i += 1) {
    const ch = src[i]
    if (quote) {
      if (ch === quote && src[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '{' || ch === '(' || ch === '[') depth += 1
    else if (ch === '}' || ch === ')' || ch === ']') {
      depth -= 1
      if (depth === 0) return src.slice(openIndex + 1, i)
    }
  }
  return null
}

/** Index du premier `:` de premier niveau, hors chaînes (-1 sinon). */
function topLevelColon(part) {
  let depth = 0
  let quote = null
  for (let i = 0; i < part.length; i += 1) {
    const ch = part[i]
    if (quote) {
      if (ch === quote && part[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch
    else if (ch === '{' || ch === '(' || ch === '[') depth += 1
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1
    else if (ch === ':' && depth === 0) return i
  }
  return -1
}

/** Clés de premier niveau d'un littéral d'objet (null si non littéral). */
function objectKeys(src, openIndex) {
  const inner = topLevelSlice(src, openIndex)
  if (inner === null) return null
  const parts = []
  let depth = 0
  let quote = null
  let buf = ''
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i]
    if (quote) {
      buf += ch
      if (ch === quote && inner[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      buf += ch
      continue
    }
    if (ch === '{' || ch === '(' || ch === '[') depth += 1
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(buf)
      buf = ''
      continue
    }
    buf += ch
  }
  parts.push(buf)
  return parts
    .map((part) => {
      const clean = part.trim()
      const colon = topLevelColon(clean)
      const raw = colon >= 0 ? clean.slice(0, colon) : clean
      return raw.trim().replace(/^['"]|['"]$/g, '')
    })
    .filter((k) => /^[A-Za-z_$][\w$]*$/.test(k))
}

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p)
  }
  return out
}

/** Clés d'un payload rangé dans une variable : littéral + `v.cle = …`. */
function payloadKeys(src, varName, method) {
  const keys = new Set()
  let found = false
  const decl = new RegExp(`(?:const|let)\\s+${varName}\\s*(?::[^=]+)?=\\s*\\{`, 'g')
  for (const m of src.matchAll(decl)) {
    const open = m.index + m[0].length - 1
    const literal = objectKeys(src, open)
    if (literal) {
      found = true
      literal.forEach((k) => keys.add(k))
    }
  }
  for (const m of src.matchAll(new RegExp(`\\b${varName}\\.([A-Za-z_$][\\w$]*)\\s*=\\s*[^=]`, 'g'))) {
    found = true
    keys.add(m[1])
  }
  if (!found || (method === 'select' && !keys.size)) return null
  return keys.size ? [...keys] : null
}

/** Appels au client Supabase : { table, method, keys|null, file, line }. */
function clientCalls() {
  const calls = []
  for (const file of walk('src')) {
    const src = fs.readFileSync(file, 'utf8')
    for (const match of src.matchAll(/\.from\(\s*['"](\w[\w-]*)['"]\s*\)/g)) {
      const table = match[1]
      const after = src.slice(match.index + match[0].length)
      const stop = after.search(/;|\n\s*\n/)
      const chain = stop >= 0 ? after.slice(0, stop) : after
      const call = chain.match(/\.(insert|upsert|update|select)\(|\.(delete)\(\s*\)/)
      if (!call) continue
      const method = call[1] ?? 'delete'
      const line = src.slice(0, match.index).split('\n').length
      if (method === 'delete') {
        calls.push({ table, method, keys: [], file, line })
        continue
      }
      const callAt = chain.indexOf(`.${method}`)
      const open = chain.indexOf('(', callAt)
      const rest = chain.slice(open + 1)
      const argStart = open + 1 + rest.search(/\S/)
      if (!chain[argStart]) continue
      if (chain[argStart] === '{') {
        calls.push({ table, method, keys: objectKeys(chain, argStart), file, line })
        continue
      }
      if (method === 'select' && (chain[argStart] === ')' || chain[argStart] === '*')) {
        // `select()` / `select('*')` : toutes les colonnes.
        const star = chain.slice(argStart).match(/^([^)]*)\)/)?.[1]?.replace(/[\s'"]/g, '') ?? ''
        calls.push({ table, method, keys: star === '*' || star === '' ? [] : null, file, line })
        continue
      }
      if (method === 'select') {
        const arg = chain.slice(argStart).match(/^'([^']*)'|^"([^"]*)"/)
        if (arg) {
          const raw = arg[1] ?? arg[2]
          const columns = raw.split(',').map((c) => c.trim()).filter(Boolean)
          // `select('*')` ou `select()` : toutes les colonnes.
          calls.push({
            table,
            method,
            keys: columns.length === 0 || (columns.length === 1 && columns[0] === '*') ? [] : columns,
            file,
            line,
          })
          continue
        }
        // Constante de fichier : `const COLS = 'a,b,c'` puis `.select(COLS)`.
        const constName = chain.slice(argStart).match(/^([A-Za-z_$][\w$]*)/)?.[1]
        const declared = constName
          ? src.match(new RegExp(`const\\s+${constName}\\s*=\\s*'([^']*)'`))
          : null
        if (declared) {
          calls.push({ table, method, keys: declared[1].split(',').map((c) => c.trim()).filter(Boolean), file, line })
          continue
        }
      }
      const varName = chain.slice(argStart).match(/^([A-Za-z_$][\w$]*)/)?.[1]
      const keys = varName ? payloadKeys(src, varName, method) : null
      calls.push({ table, method, keys, file, line })
    }
  }
  return calls
}

/** Découpe une liste d'arguments/propriétés de premier niveau. */
function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let quote = null
  let buf = ''
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quote) {
      buf += ch
      if (ch === quote && text[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      buf += ch
      continue
    }
    if (ch === '{' || ch === '(' || ch === '[') depth += 1
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(buf)
      buf = ''
      continue
    }
    buf += ch
  }
  parts.push(buf)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/**
 * Tables touchées via un helper à table variable, ex. `wipe('reports', …)`
 * de src/lib/account.ts (cas de la suppression de compte). La délégation est
 * suivie (wipe → wipeTable) pour ne rien laisser passer.
 */
function helperCalls() {
  const out = []
  for (const file of walk('src')) {
    const src = fs.readFileSync(file, 'utf8')
    const decls = [...src.matchAll(
      /(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::[^=]*)?=>/g,
    )].map((m, i, all) => ({
      name: m[1] ?? m[3],
      params: (m[2] ?? m[4] ?? '').split(',').map((p) => p.trim().split(/[:\s]/)[0]).filter(Boolean),
      start: m.index,
      end: all[i + 1]?.index ?? src.length,
    }))
    /** name → { paramIndex, method } */
    const helpers = new Map()
    // 1. Helpers directs : `.from(param).delete()` dans le corps.
    for (const d of decls) {
      const body = src.slice(d.start, d.end)
      for (const m of body.matchAll(/\.from\(\s*(\w+)\s*\)\s*\.\s*(insert|upsert|update|select|delete)\b/g)) {
        const paramIndex = d.params.indexOf(m[1])
        if (paramIndex >= 0) helpers.set(d.name, { paramIndex, method: m[2] })
      }
    }
    // 2. Propagation : un helper appelé par un autre avec son propre paramètre.
    for (let pass = 0; pass < 4; pass += 1) {
      for (const d of decls) {
        if (helpers.has(d.name)) continue
        const body = src.slice(d.start, d.end)
        for (const [name, info] of helpers) {
          for (const call of body.matchAll(new RegExp(`\\b${name}\\(([^)]*)\\)`, 'g'))) {
            const args = splitTopLevel(call[1])
            const arg = args[info.paramIndex] ?? ''
            const ident = /^[A-Za-z_$][\w$]*$/.test(arg) ? arg : null
            const index = ident ? d.params.indexOf(ident) : -1
            if (index >= 0) helpers.set(d.name, { paramIndex: index, method: info.method })
          }
        }
      }
    }
    // 3. Sites d'appel : littéraux + boucles sur tableau littéral.
    for (const [name, info] of helpers) {
      for (const call of src.matchAll(new RegExp(`\\b${name}\\(([^)]*)\\)`, 'g'))) {
        const arg = splitTopLevel(call[1])[info.paramIndex] ?? ''
        const literal = arg.match(/^'([\w-]+)'|^"([\w-]+)"/)
        if (literal) {
          out.push({
            table: literal[1] ?? literal[2],
            method: info.method,
            keys: info.method === 'delete' ? [] : null,
            file,
            line: src.slice(0, call.index).split('\n').length,
          })
          continue
        }
        if (!/^[A-Za-z_$][\w$]*$/.test(arg)) continue
        for (const loop of src.matchAll(new RegExp(`for\\s*\\(\\s*const\\s+${arg}\\s+of\\s*\\[([^\\]]*)\\]`, 'g'))) {
          for (const table of loop[1].matchAll(/'([\w-]+)'/g)) {
            out.push({
              table: table[1],
              method: info.method,
              keys: info.method === 'delete' ? [] : null,
              file,
              line: src.slice(0, call.index).split('\n').length,
            })
          }
        }
      }
    }
  }
  return out
}

/* --------------------------------- contrôle -------------------------------- */

const { privs, policies, storagePolicies } = buildCatalog()
const calls = [...clientCalls(), ...helperCalls()]
if (process.env.PERMS_DEBUG) {
  console.log(JSON.stringify(calls.filter((c) => c.table === process.env.PERMS_DEBUG), null, 1))
}
const problems = []
const skipped = []

const KNOWN_TABLES = new Set(privs.keys())
const policyAllows = (table, cmd) =>
  [...(policies.get(table)?.values() ?? [])].some((c) => c === cmd || c === 'all')

for (const call of calls) {
  if (!KNOWN_TABLES.has(call.table)) continue
  const where = `${call.file}:${call.line} · ${call.table}.${call.method}`
  const p = privs.get(call.table)
  if (!call.keys) {
    skipped.push(where)
    continue
  }
  if (call.method === 'delete') {
    if (!p.delete) problems.push(`${where} → GRANT delete manquant`)
    else if (!policyAllows(call.table, 'delete')) problems.push(`${where} → aucune policy « for delete » sur ${call.table}`)
    continue
  }
  if (call.method === 'select') {
    const wildcard = call.keys.length === 0
    if (!p.select) problems.push(`${where} → GRANT select manquant`)
    else if (wildcard && p.select instanceof Set) {
      problems.push(`${where} → toutes les colonnes demandées alors que ${call.table} n'accorde que (${[...p.select].join(', ')})`)
    } else if (p.select instanceof Set) {
      const missing = call.keys.filter((k) => !p.select.has(k))
      if (missing.length) problems.push(`${where} → colonne(s) non accordée(s) : ${missing.join(', ')}`)
    }
    continue
  }
  const needed = call.method === 'upsert' ? ['insert', 'update'] : [call.method]
  for (const priv of needed) {
    const granted = p[priv]
    if (!granted) {
      problems.push(`${where} → GRANT ${priv} manquant`)
      continue
    }
    if (granted instanceof Set) {
      const missing = call.keys.filter((k) => !granted.has(k))
      if (missing.length) problems.push(`${where} → colonne(s) non accordée(s) : ${missing.join(', ')}`)
    }
  }
}

/* ---------------------------------- Storage -------------------------------- */

const BUCKETS = [
  { bucket: 'avatars', cmds: ['insert', 'update', 'delete'] },
  { bucket: 'post-photos', cmds: ['select', 'insert', 'delete'] },
]
for (const { bucket, cmds } of BUCKETS) {
  for (const cmd of cmds) {
    const ok = storagePolicies.some((p) => p.buckets.includes(bucket) && (p.cmd === cmd || p.cmd === 'all'))
    if (!ok) problems.push(`storage '${bucket}' : aucune policy « for ${cmd} »`)
  }
}

/* ----------------------------------- sortie -------------------------------- */

console.log(`Tables SQL : ${KNOWN_TABLES.size} · appels client analysés : ${calls.length}`)
if (skipped.length) console.log(`Payloads dynamiques ignorés (${skipped.length}) :\n- ${skipped.join('\n- ')}`)
if (problems.length) {
  console.error(`\n❌ Permissions manquantes (${problems.length}) :\n- ${problems.join('\n- ')}`)
  console.error('\nCorrectif : supabase/schema_permissions_fix.sql (étape 15).')
  process.exit(1)
}
console.log('✅ Permissions SQL cohérentes avec les appels du client.')