import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const deployDir = join(projectDir, 'deploy')
const releaseDir = join(projectDir, '.release-next')
const finalDir = join(projectDir, 'release')
const previousDir = join(projectDir, '.release-previous')

for (const file of ['deploy/php/config.php', 'deploy/php/_features.php', 'deploy/php/public_config.php', 'deploy/php/music_source.php', 'deploy/php/music_source_adapters.php', 'deploy/.env.production.template', 'deploy/root.htaccess', 'deploy/nginx.conf.example', 'deploy/sql/listen_history.sql', 'deploy/sql/client_entry_stats.sql', 'deploy/sql/2026-09-09-heart-mode.sql', 'scripts/init-database.php']) {
  if (!existsSync(join(projectDir, file))) throw new Error(`Missing release input: ${file}`)
}
if (existsSync(previousDir)) throw new Error('A previous release backup exists; inspect .release-previous before rebuilding.')
const build = spawnSync(process.execPath, [join(projectDir, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: projectDir, stdio: 'inherit' })
if (build.error) throw build.error
if (build.status !== 0) process.exit(build.status || 1)

if (basename(releaseDir) !== '.release-next' || dirname(releaseDir) !== projectDir) throw new Error('Unsafe staging path')
rmSync(releaseDir, { recursive: true, force: true })
try {
  mkdirSync(releaseDir)
  cpSync(join(projectDir, 'dist'), releaseDir, { recursive: true, filter: deploymentInput })
  cpSync(join(deployDir, 'php'), join(releaseDir, 'php'), { recursive: true, filter: deploymentInput })
  cpSync(join(projectDir, 'admin'), join(releaseDir, 'admin'), { recursive: true, filter: deploymentInput })
  cpSync(join(projectDir, 'api_check'), join(releaseDir, 'api_check'), { recursive: true, filter: deploymentInput })
  cpSync(join(deployDir, 'api_check'), join(releaseDir, 'api_check'), { recursive: true, filter: deploymentInput })
  cpSync(join(deployDir, 'sql'), join(releaseDir, 'sql'), { recursive: true, filter: deploymentInput })
  cpSync(join(deployDir, 'sql/client_entry_stats.sql'), join(releaseDir, 'client_entry_stats.sql'))
  cpSync(join(deployDir, 'root.htaccess'), join(releaseDir, '.htaccess'))
  cpSync(join(deployDir, 'nginx.conf.example'), join(releaseDir, 'nginx.conf.example'))
  cpSync(join(deployDir, '.env.production.template'), join(releaseDir, '.env.production.example'))
  mkdirSync(join(releaseDir, 'scripts'))
  cpSync(join(projectDir, 'scripts/init-database.php'), join(releaseDir, 'scripts/init-database.php'))
  mkdirSync(join(releaseDir, 'cache'))
  writeFileSync(join(releaseDir, 'cache/.gitkeep'), '')
  mkdirSync(join(releaseDir, 'upload/avatars'), { recursive: true })
  const forbiddenSecretPatterns = [
    /define\(\s*['"]DB_PASS['"]\s*,\s*['"][^'"]+['"]\s*\)/i,
    /\$mail->Password\s*=\s*['"][^'"]+['"]/i,
    /\$db_pass\s*=\s*['"][^'"]+['"]/i,
  ]
  for (const file of walkFiles(releaseDir)) {
    const name = relative(releaseDir, file).replaceAll('\\', '/')
    if (name.startsWith('php/vendor/')) continue
    if (basename(file) === '.env' || /\.(?:log|ndjson)$/i.test(file)) throw new Error(`Private runtime file in release: ${name}`)
    if (/\.(?:php|js|json|md|example)$/i.test(file) && forbiddenSecretPatterns.some(pattern => pattern.test(readFileSync(file, 'utf8')))) throw new Error(`Possible embedded credential: ${name}`)
  }
  const manifest = walkFiles(releaseDir).map(file => ({
    path: relative(releaseDir, file).replaceAll('\\', '/'),
    size: statSync(file).size,
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
  }))
  const { version } = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))
  writeFileSync(join(releaseDir, 'release-manifest.json'), JSON.stringify({ version, createdAt: new Date().toISOString(), files: manifest }, null, 2))
  if (existsSync(finalDir)) renameSync(finalDir, previousDir)
  try { renameSync(releaseDir, finalDir) }
  catch (error) { if (existsSync(previousDir)) renameSync(previousDir, finalDir); throw error }
  rmSync(previousDir, { recursive: true, force: true })
  console.log(`[XCloud] Web release ready: ${finalDir}`)
} catch (error) {
  rmSync(releaseDir, { recursive: true, force: true })
  throw error
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not a release input: ${file}`)
    return entry.isDirectory() ? walkFiles(file) : [file]
  })
}

function deploymentInput(source) {
  // Repository documentation is not a runtime input; retain dependency licenses.
  const name = basename(source)
  return !/\.(?:md|markdown|rst)$/i.test(name) || /^(?:licen[cs]e|copying|notice)(?:[.-]|$)/i.test(name)
}
