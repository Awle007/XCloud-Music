import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { afterEach, expect, it } from 'vitest'

const roots = []
const servers = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => { server.once('exit', resolve); server.kill() })))
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
const flags = ['LOGIN', 'REGISTER', 'HEART_MODE', 'HOT_TOPLIST', 'FEEDBACK', ...['NETEASE', 'KUWO', 'QQ', 'KUGOU'].map(s => `SOURCE_${s}`)]
it('filters disabled platforms from derived heart profiles without mutating stored profile data', () => {
  const root = installation('XCLOUD_SOURCE_QQ_ENABLED=0\n')
  const code = `require ${JSON.stringify(join(root, 'php/_features.php'))}; require ${JSON.stringify(join(root, 'php/heart_mode_profile.php'))};
    $source=file_get_contents(${JSON.stringify(join(root, 'php/heart_mode.php'))});
    $prefix=explode("\\nxcloudRequireFeature('heartMode');", $source)[0];
    $prefix=preg_replace('/^require_once .*;$/m','',$prefix);
    eval(substr($prefix, 5));
    $profile=['candidate_songs'=>[['source'=>'qq','id'=>'1'],['source'=>'kuwo','id'=>'2']],
      'artist_preferences'=>['qq|Artist'=>['source'=>'qq','name'=>'Artist','weight'=>4],'kuwo|Artist'=>['source'=>'kuwo','name'=>'Artist','weight'=>2]],
      'priority_songs'=>['history'=>[['source'=>'qq','id'=>'1']]],
      'priority_artists'=>['history'=>[['name'=>'Artist','source'=>'qq','source_weights'=>['qq'=>4,'kuwo'=>2]]]]];
    echo json_encode(['effective'=>heartModeEnabledProfile($profile),'original'=>$profile]);`
  const result = spawnSync('php', ['-r', code], { encoding: 'utf8', env: { ...process.env, ...Object.fromEntries(flags.map(f => [`XCLOUD_${f}_ENABLED`, ''])) } })
  expect(result.status, result.stderr).toBe(0)
  const { effective, original } = JSON.parse(result.stdout)
  expect(effective.candidate_songs).toEqual([{ source: 'kuwo', id: '2' }])
  expect(effective.priority_songs.history).toEqual([])
  expect(effective.priority_artists.history[0]).toMatchObject({ source: 'kuwo', source_weights: { kuwo: 2 } })
  expect(effective.artist_preferences['kuwo|Artist']).toMatchObject({ weight: 2 })
  expect(original.candidate_songs).toHaveLength(2)
})
function installation(env = '') {
  const root = mkdtempSync(join(tmpdir(), 'xcloud-features-'))
  roots.push(root)
  mkdirSync(join(root, 'php'))
  for (const file of ['_env.php', '_features.php', 'public_config.php', ...accounts, 'heart_mode.php', 'heart_mode_profile.php', 'feedback_reply.php', 'feedback.php', 'xcloud_hot_toplist.php', 'track_client_entry.php', ...tasks, ...official]) {
    if (existsSync(resolve('deploy/php', file))) copyFileSync(resolve('deploy/php', file), join(root, 'php', file))
  }
  writeFileSync(join(root, '.env'), env)
  writeFileSync(join(root, 'php/config.php'), '<?php throw new RuntimeException("DATABASE_TOUCHED");')
  writeFileSync(join(root, 'php/_phase3_guard.php'), '<?php throw new RuntimeException("AUTH_TOUCHED");')
  writeFileSync(join(root, 'php/_security.php'), '<?php throw new RuntimeException("SECURITY_TOUCHED");')
  mkdirSync(join(root, 'api_check'))
  copyFileSync(resolve('deploy/api_check/heart_mode_check.php'), join(root, 'api_check/heart_mode_check.php'))
  return root
}
const accounts = ['login.php', 'logout.php', 'verify_token.php', 'register.php', 'register_verification.php', 'verify_email.php', 'forgot_password.php', 'change_password.php', 'update_avatar.php', 'favorite.php', 'get_favorites.php', 'sync_favorites.php', 'playlist.php', 'get_playlist_id.php', 'get_playlists.php', 'delete_playlist.php', 'rename_playlist.php', 'sync_playlists.php', 'listen_history.php', 'clear_listen_history.php']
const tasks = ['rebuild_heart_mode.php', 'send_feedback_digest.php', 'update_xcloud_hot_toplist.php', 'migrate_avatars.php', 'update_toplist.php']
const official = ['toplist.php', 'netease_artist.php', 'get_netease_playlist.php', 'kuwo_mv.php']
function run(root, script, args = []) {
  return spawnSync('php', [join(root, 'php', script), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...Object.fromEntries(flags.map(f => [`XCLOUD_${f}_ENABLED`, ''])) } })
}
async function http(root) {
  const port = await new Promise(resolve => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)) }) })
  const server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], { cwd: root, env: { ...process.env, ...Object.fromEntries(flags.map(f => [`XCLOUD_${f}_ENABLED`, ''])) }, stdio: ['ignore', 'ignore', 'pipe'] })
  servers.push(server)
  await new Promise((resolve, reject) => { server.once('error', reject); server.stderr.once('data', resolve) })
  return async file => fetch(`http://127.0.0.1:${port}/php/${file}`)
}
it('publishes only effective boolean features and honors login dependencies', () => {
  const result = run(installation('XCLOUD_LOGIN_ENABLED=0\nXCLOUD_REGISTER_ENABLED=1\nXCLOUD_HEART_MODE_ENABLED=1\nDB_PASS=private-sentinel\nXCLOUD_MUSIC_API_1_URL=https://private.invalid\n'), 'public_config.php')
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ features: { login: false, register: false, heartMode: false, hotToplist: true, feedback: true, sources: { netease: true, kuwo: true, qq: true, kugou: true } } })
})
it('defaults to existing modules with heart mode disabled', () => {
  const result = run(installation(), 'public_config.php')
  expect(JSON.parse(result.stdout).features).toMatchObject({ login: true, register: true, heartMode: false, hotToplist: true, feedback: true })
})
it.each(['true', 'false', '2', 'yes'])('rejects malformed feature configuration %s without exposing its value', async value => {
  const request = await http(installation(`XCLOUD_LOGIN_ENABLED=${value}\n`))
  const response = await request('public_config.php')
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ success: false, error_code: 'CONFIG_INVALID' })
})
it('blocks every account endpoint before database, authentication or security initialization', async () => {
  const request = await http(installation('XCLOUD_LOGIN_ENABLED=0\n'))
  for (const file of accounts) {
    const response = await request(file)
    expect(response.status, file).toBe(503)
    expect(await response.json(), file).toMatchObject({ error_code: 'FEATURE_DISABLED' })
  }
})
it('blocks independent modules and official sources before their dependencies', async () => {
  const request = await http(installation('XCLOUD_FEEDBACK_ENABLED=0\nXCLOUD_HOT_TOPLIST_ENABLED=0\nXCLOUD_SOURCE_NETEASE_ENABLED=0\nXCLOUD_SOURCE_KUWO_ENABLED=0\n'))
  for (const file of ['heart_mode.php', '../api_check/heart_mode_check.php', 'feedback.php', 'xcloud_hot_toplist.php', ...official]) {
    const response = await request(file)
    expect(response.status, file).toBe(503)
    expect(await response.json(), file).toMatchObject({ error_code: 'FEATURE_DISABLED' })
  }
})
it('skips disabled scheduled tasks successfully before connecting to a database', () => {
  const root = installation('XCLOUD_LOGIN_ENABLED=0\nXCLOUD_FEEDBACK_ENABLED=0\nXCLOUD_HOT_TOPLIST_ENABLED=0\nXCLOUD_SOURCE_NETEASE_ENABLED=0\n')
  for (const file of tasks) {
    const result = run(root, file)
    expect(result.status, `${file}: ${result.stderr}`).toBe(0)
    expect(result.stdout, file).toContain('FEATURE_DISABLED')
  }
})
it('allows explicit first heart-mode preparation while still requiring login', () => {
  const result = run(installation(), 'rebuild_heart_mode.php', ['--force', '--mode=global'])
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('DATABASE_TOUCHED')
  const disabled = run(installation('XCLOUD_LOGIN_ENABLED=0\n'), 'rebuild_heart_mode.php', ['--force', '--mode=global'])
  expect(disabled.status).toBe(0)
  expect(disabled.stdout).toContain('FEATURE_DISABLED')
})
it('skips anonymous database statistics in playback-only mode', async () => {
  const request = await http(installation('XCLOUD_LOGIN_ENABLED=0\nXCLOUD_HOT_TOPLIST_ENABLED=0\nXCLOUD_FEEDBACK_ENABLED=0\n'))
  const response = await request('track_client_entry.php')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ success: true, skipped: true })
})
it('keeps cached site charts available when login is disabled', async () => {
  const request = await http(installation('XCLOUD_LOGIN_ENABLED=0\n'))
  const response = await request('xcloud_hot_toplist.php')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ type: 'xcloud_hot', data: [] })
})
it('can disable registration while preserving login and independent modules', async () => {
  const root = installation('XCLOUD_REGISTER_ENABLED=0\n')
  expect(JSON.parse(run(root, 'public_config.php').stdout).features).toMatchObject({ login: true, register: false, hotToplist: true, feedback: true })
  const request = await http(root)
  for (const file of ['register.php', 'register_verification.php']) expect((await request(file)).status).toBe(503)
})
it('validates dependent and source flags even while login is disabled', async () => {
  const request = await http(installation('XCLOUD_LOGIN_ENABLED=0\nXCLOUD_REGISTER_ENABLED=invalid-private-sentinel\n'))
  const response = await request('public_config.php')
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('invalid-private-sentinel')
})
it('skips the default heart rebuild without force and rejects invalid CLI configuration', () => {
  const result = run(installation(), 'rebuild_heart_mode.php', ['--mode=global'])
  expect(result.status).toBe(0)
  expect(result.stdout).toContain('FEATURE_DISABLED')
  const invalid = run(installation('XCLOUD_HEART_MODE_ENABLED=invalid\n'), 'rebuild_heart_mode.php', ['--force', '--mode=global'])
  expect(invalid.status).toBe(1)
  expect(invalid.stderr).toContain('CONFIG_INVALID')
})
it('blocks feedback reply before administrator authentication and its database', async () => {
  const root = installation('XCLOUD_FEEDBACK_ENABLED=0\n')
  mkdirSync(join(root, 'admin/api'), { recursive: true })
  mkdirSync(join(root, 'admin/includes'), { recursive: true })
  copyFileSync(resolve('admin/api/reply_feedback.php'), join(root, 'admin/api/reply_feedback.php'))
  writeFileSync(join(root, 'admin/includes/auth.php'), '<?php throw new RuntimeException("ADMIN_AUTH_TOUCHED");')
  const request = await http(root)
  const response = await request('../admin/api/reply_feedback.php')
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ error_code: 'FEATURE_DISABLED' })
})
it('blocks feedback library sends before invoking their transport or reading archives', () => {
  const root = installation('XCLOUD_FEEDBACK_ENABLED=0\n')
  writeFileSync(join(root, 'php/call_reply.php'), '<?php require __DIR__."/feedback_reply.php"; xcloudProcessFeedbackReply("missing", "missing", "reply", function() { throw new RuntimeException("SMTP_TOUCHED"); });')
  const result = run(root, 'call_reply.php')
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('FEATURE_DISABLED')
})
