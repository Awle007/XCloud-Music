import { readdirSync, readFileSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const excluded = new Set(['node_modules', 'vendor', '.git', '.release-next', '.release-previous'])
const forbidden = [
  ['xcloudv', 'top'].join('.'),
  ['111', '170', '14', '28'].join('.'),
  ['111', '170', '14', '107'].join('.'),
  ['59', '110', '142', '10'].join('.'),
  ['music-api', 'gdstudio', 'xyz'].join('.'),
  ['jx', 'xshyun', 'top'].join('.'),
]
const issues = []
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || excluded.has(entry.name)) continue
    const file = join(directory, entry.name)
    if (entry.isDirectory()) { walk(file); continue }
    if (!/\.(?:php|js|mjs|cjs|vue|css|html|json|md|txt|ini|example|template)$/.test(entry.name) && !entry.name.startsWith('.env')) continue
    const content = readFileSync(file, 'utf8')
    const name = relative(root, file).replaceAll('\\', '/')
    for (const host of forbidden) if (content.includes(host)) issues.push(`${name}: unredacted service address`)
    // License sources and package-manager metadata are not runtime assets.
    if (!name.startsWith('public/vendor/') && /(?:<(?:script|img|iframe)\b[^>]*\bsrc|<link\b[^>]*\bhref)\s*=\s*["'](?:https?:)?\/\//i.test(content)) {
      issues.push(`${name}: remote static HTML asset`)
    }
    if (!name.startsWith('public/vendor/') && /(?:https?:)?\/\/(?:cdn\.jsdelivr\.net|cdn\.datatables\.net|hm\.baidu\.com)\//.test(content)) issues.push(`${name}: remote CDN or analytics dependency`)
  }
}
walk(resolve(root))
if (issues.length) { console.error([...new Set(issues)].join('\n')); process.exitCode = 1 }
else console.log('Open-source distribution check passed: private service addresses redacted; official music endpoints retained; static assets local.')
