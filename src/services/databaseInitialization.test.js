import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'

const fixtures = []
afterEach(() => { for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }) })

function installation() {
  const root = mkdtempSync(join(tmpdir(), 'xcloud-install-'))
  fixtures.push(root)
  for (const name of ['scripts', 'php', 'sql', 'admin/includes']) mkdirSync(join(root, name), { recursive: true })
  copyFileSync(resolve('scripts/init-database.php'), join(root, 'scripts/init-database.php'))
  copyFileSync(resolve('deploy/php/_env.php'), join(root, 'php/_env.php'))
  for (const name of ['listen_history.sql', 'client_entry_stats.sql', '2026-09-09-heart-mode.sql']) copyFileSync(resolve('deploy/sql', name), join(root, 'sql', name))
  // The subprocess tests the installer workflow without connecting to a real database.
  writeFileSync(join(root, '.env'), 'ADMIN_USERNAME=installer\nADMIN_PASSWORD=a-unique-install-password\n')
  writeFileSync(join(root, 'php/config.php'), `<?php
require_once __DIR__ . '/_env.php';
class InstallationDatabase {
  public function exec($sql) {
    if (getenv('INSTALL_TEST_FAIL_SQL')) throw new RuntimeException('Simulated SQL failure');
    file_put_contents(__DIR__.'/../operations.log', $sql."\\n", FILE_APPEND);
  }
  public function prepare($sql) { return new InstallationTableCheck(); }
}
class InstallationTableCheck {
  private $table;
  public function execute($values) { $this->table=$values[0]; }
  public function fetchColumn() { return getenv('INSTALL_TEST_MISSING_TABLE') === $this->table ? false : $this->table; }
}
function getDBConnection() { return new InstallationDatabase(); }
function createTables() { file_put_contents(__DIR__.'/../operations.log', "BASE TABLES\\n", FILE_APPEND); }
`)
  writeFileSync(join(root, 'admin/includes/db_init.php'), '<?php file_put_contents(__DIR__."/../../operations.log", "ADMIN TABLES\\n", FILE_APPEND);')
  return root
}

function run(root, args = [], env = {}) {
  return spawnSync('php', [join(root, 'scripts/init-database.php'), ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, INSTALL_TEST_FAIL_SQL: '', INSTALL_TEST_MISSING_TABLE: '', ADMIN_USERNAME: '', ADMIN_PASSWORD: '', ...env },
  })
}

it('initializes history, statistics and every heart-mode table with the single release command', () => {
  const root = installation()
  const result = run(root)
  expect(result.status, result.stderr).toBe(0)
  const operations = readFileSync(join(root, 'operations.log'), 'utf8')
  for (const table of ['listen_history', 'client_entry_stats', 'heart_mode_migrations', 'heart_mode_song_stats', 'heart_mode_cooccurrence', 'heart_mode_user_profiles', 'heart_mode_user_signals', 'heart_mode_signal_batches', 'heart_mode_metrics']) {
    expect(operations).toMatch(new RegExp('CREATE TABLE IF NOT EXISTS `?' + table + '\\b'))
  }
  expect(operations).toContain('BASE TABLES')
  expect(operations).toContain('ADMIN TABLES')
})

it('checks all migration inputs before changing the database', () => {
  const root = installation()
  rmSync(join(root, 'sql/2026-09-09-heart-mode.sql'))
  const result = run(root)
  expect(result.status).not.toBe(0)
  expect(() => readFileSync(join(root, 'operations.log'))).toThrow()
})

it('reports SQL failures with a nonzero exit status', () => {
  const root = installation()
  const result = run(root, [], { INSTALL_TEST_FAIL_SQL: '1' })
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Simulated SQL failure')
})

it('shows help without requiring installation configuration', () => {
  const root = installation()
  rmSync(join(root, '.env'))
  const result = run(root, ['--help'])
  expect(result.status).toBe(0)
  expect(result.stdout).toContain('php scripts/init-database.php')
  expect(() => readFileSync(join(root, 'operations.log'))).toThrow()
})

it('does not report success when a required heart-mode table is absent', () => {
  const result = run(installation(), [], { INSTALL_TEST_MISSING_TABLE: 'heart_mode_user_signals' })
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('heart_mode_user_signals')
})

it('rejects placeholder administrator credentials before schema changes', () => {
  const root = installation()
  writeFileSync(join(root, '.env'), 'ADMIN_USERNAME=admin\nADMIN_PASSWORD=change-me-before-install\n')
  expect(run(root).status).not.toBe(0)
  expect(() => readFileSync(join(root, 'operations.log'))).toThrow()
})

it('also resolves the source checkout layout and its deploy/.env', () => {
  const root = installation()
  mkdirSync(join(root, 'deploy'))
  // The source installer must locate deploy/php and deploy/sql instead of root/php.
  renameSync(join(root, 'php'), join(root, 'deploy/php'))
  renameSync(join(root, 'sql'), join(root, 'deploy/sql'))
  renameSync(join(root, '.env'), join(root, 'deploy/.env'))
  expect(run(root).status).toBe(0)
})
