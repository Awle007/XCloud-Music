// @vitest-environment node
import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'

const exec = promisify(execFile)
const servers = []
const children = []
const directories = []
afterEach(async () => {
  await Promise.all(children.splice(0).map(child => new Promise(resolve => { child.once('exit', resolve); child.kill() })))
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
async function php(code, env = {}) {
  const root = mkdtempSync(join(tmpdir(), 'xcloud-adapters-'))
  directories.push(root)
  mkdirSync(join(root, 'php'))
  for (const file of ['_env.php', 'music_source_adapters.php']) copyFileSync(resolve('deploy/php', file), join(root, 'php', file))
  // Keep developer .env settings out of mocked provider fallback tests.
  const providerDefaults = Object.fromEntries(Array.from({ length: 20 }, (_, index) =>
    [`XCLOUD_MUSIC_API_${index + 1}_ENABLED`, index < 2 ? '1' : '0']))
  for (const index of [1, 2]) providerDefaults[`XCLOUD_MUSIC_API_${index}_SOURCES`] = 'netease,kuwo,qq,kugou'
  const result = await exec('php', ['-r', `require ${JSON.stringify(join(root, 'php/music_source_adapters.php'))}; ${code}`], {
    encoding: 'utf8', env: { ...process.env, ...providerDefaults, ...env },
  })
  return JSON.parse(result.stdout)
}
async function upstream(handler) {
  const server = createServer(handler)
  servers.push(server)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}/api.php`
}

async function gateway(url, format = 'meting') {
  const root = mkdtempSync(join(tmpdir(), 'xcloud-gateway-'))
  directories.push(root)
  mkdirSync(join(root, 'php'))
  for (const file of ['_env.php', '_features.php', 'music_source.php', 'music_source_adapters.php', 'music_api.php', 'native_stream.php', 'qq_source.php']) copyFileSync(resolve('deploy/php', file), join(root, 'php', file))
  const port = await new Promise(resolve => {
    const reserve = createServer()
    reserve.listen(0, '127.0.0.1', () => { const port = reserve.address().port; reserve.close(() => resolve(port)) })
  })
  const child = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], {
    env: { ...process.env, XCLOUD_MUSIC_API_1_URL: url, XCLOUD_MUSIC_API_1_FORMAT: format,
      XCLOUD_MUSIC_API_1_ENABLED: '1', XCLOUD_MUSIC_API_1_SOURCES: 'netease,kuwo,qq,kugou',
      XCLOUD_MUSIC_API_2_URL: '', XCLOUD_SOURCE_NETEASE_ENABLED: '1', XCLOUD_SOURCE_KUWO_ENABLED: '1', XCLOUD_SOURCE_QQ_ENABLED: '1', XCLOUD_SOURCE_KUGOU_ENABLED: '0',
      XCLOUD_LOGIN_ENABLED: '0', XCLOUD_REGISTER_ENABLED: '0', XCLOUD_HEART_MODE_ENABLED: '0', XCLOUD_HOT_TOPLIST_ENABLED: '0', XCLOUD_FEEDBACK_ENABLED: '0' },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  children.push(child)
  await new Promise((resolve, reject) => { child.once('error', reject); child.stderr.once('data', resolve) })
  return (file, options) => fetch(`http://127.0.0.1:${port}/php/${file}`, options)
}

it('serves unified JSON requests and old search aliases without a database', async () => {
  const queries = []
  const url = await upstream((req, res) => {
    queries.push(Object.fromEntries(new URL(req.url, 'http://localhost').searchParams))
    res.end(JSON.stringify([{ id: '42', name: 'Song', artist: ['Artist'], pic_id: 'image-id' }]))
  })
  const request = await gateway(url)
  const response = await request('music_source.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'search', source: 'qq', keyword: 'Song', page: 2, limit: 50 }) })
  expect(response.status).toBe(200)
  expect((await response.json()).data[0]).toMatchObject({ id: '42', source: 'qq', artist: 'Artist' })
  const legacy = await request('qq_source.php?action=search&all=Song&pn=2&n=50')
  expect((await legacy.json())[0]).toMatchObject({ id: '42', source: 'qq' })
  expect(queries.every(query => query.source === 'qq' && query.pages === '2' && query.limit === '50')).toBe(true)
})

it('rejects disabled platforms and invalid JSON parameters without contacting an upstream', async () => {
  let hits = 0
  const url = await upstream((req, res) => { hits++; res.end('[]') })
  const request = await gateway(url)
  const disabled = await request('music_source.php?action=search&source=kugou&keyword=test')
  expect(disabled.status).toBe(503)
  expect(await disabled.json()).toMatchObject({ error_code: 'FEATURE_DISABLED' })
  const invalid = await request('music_source.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'search', source: ['qq'], keyword: 'test' }) })
  expect(invalid.status).toBe(400)
  expect(hits).toBe(0)
})

it('uses the picture ID for cover redirects and the song ID for native audio redirects', async () => {
  const queries = []
  const url = await upstream((req, res) => {
    const query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams)
    queries.push(query)
    res.end(JSON.stringify({ url: `https://example.com/${query.types === 'pic' ? 'cover.jpg' : 'song.m4a'}`, type: 'm4a' }))
  })
  const request = await gateway(url)
  const cover = await request('music_api.php?types=cover&source=netease&id=42&pic_id=picture-99', { redirect: 'manual' })
  expect(cover.status).toBe(302)
  expect(cover.headers.get('location')).toBe('https://example.com/cover.jpg')
  const audio = await request('native_stream.php?source=netease&id=42&quality=320', { redirect: 'manual' })
  expect(audio.status).toBe(302)
  expect(audio.headers.get('location')).toBe('https://example.com/song.m4a')
  expect(queries.map(query => query.id)).toEqual(['picture-99', '42'])
})

it('maps the reference local protocol with one-based pagination and distinct platform identities', async () => {
  const data = await php(`echo json_encode([
    xcloudMusicQuery('local', 'search', 'qq', ['keyword'=>'测试', 'page'=>2, 'limit'=>50]),
    xcloudMusicNormalize('local', 'search', 'qq', ['code'=>0,'data'=>['songs'=>[['rid'=>'42','name'=>'歌曲','artist'=>'歌手','pic'=>'https://example.com/cover.jpg']]]], [])
  ]);`)
  expect(data[0]).toMatchObject({ api: 'search_with_source', key: '测试', pn: 2, source: 'QQ音乐' })
  expect(data[1].data[0]).toMatchObject({ id: '42', source: 'qq', lyric_id: '42', name: '歌曲' })
})

it('selects the nearest local audio quality and preserves the actual container and embedded lyric', async () => {
  const data = await php(`echo json_encode(xcloudMusicNormalize('local','url','netease',[
    'gc'=>'[00:01]歌词','data'=>[
      ['url'=>'https://example.com/song.flac','type'=>'flac','ts'=>'SQ'],
      ['url'=>'https://example.com/song.m4a','type'=>'m4a','ts'=>'HQ'],
      ['url'=>'javascript:alert(1)','type'=>'mp3','ts'=>'HQ']
    ]
  ], ['quality'=>'320']));`)
  expect(data).toMatchObject({ url: 'https://example.com/song.m4a', br: 320, type: 'm4a', lyric: '[00:01]歌词' })
})

it('uses Meting numeric cover identifiers and preserves translation fields', async () => {
  const data = await php(`echo json_encode([
    xcloudMusicQuery('meting','cover','netease',['id'=>'109951170045577565']),
    xcloudMusicNormalize('meting','search','netease', [['id'=>'1','name'=>'歌','artist'=>['歌手'],'pic_id'=>'109951170045577565']], []),
    xcloudMusicNormalize('meting','lyric','netease',['lyric'=>'中文','tlyric'=>'翻译'],[])
  ]);`)
  expect(data[0]).toMatchObject({ types: 'pic', id: '109951170045577565' })
  expect(data[1].data[0].pic_id).toBe('109951170045577565')
  expect(data[2]).toMatchObject({ lyric: '中文', tlyric: '翻译' })
})

it('distinguishes song IDs from picture IDs when switching between cover protocols', async () => {
  const data = await php(`echo json_encode([
    xcloudMusicQuery('local','cover','netease',['id'=>'42','pic_id'=>'109951170045577565']),
    xcloudMusicQuery('meting','cover','netease',['id'=>'42','pic_id'=>'109951170045577565'])
  ]);`)
  expect(data[0].id).toBe('42')
  expect(data[1].id).toBe('109951170045577565')
})

it('tries configured providers in order over real HTTP and keeps fixed URL query parameters', async () => {
  const requests = []
  const url = await upstream((req, res) => {
    const query = new URL(req.url, 'http://localhost').searchParams
    requests.push(Object.fromEntries(query))
    res.setHeader('Content-Type', 'application/json')
    if (query.get('key') === 'first') res.end(JSON.stringify({ error: 'upstream secret response' }))
    else res.end(JSON.stringify({ url: 'https://example.com/song.m4a', br: 320 }))
  })
  const data = await php(`echo json_encode(xcloudMusicResolve('url','qq',['id'=>'42','quality'=>'320']));`, {
    XCLOUD_MUSIC_API_1_URL: `${url}?key=first`, XCLOUD_MUSIC_API_1_FORMAT: 'meting',
    XCLOUD_MUSIC_API_2_URL: `${url}?key=second`, XCLOUD_MUSIC_API_2_FORMAT: 'meting',
  })
  expect(data.url).toBe('https://example.com/song.m4a')
  expect(requests).toHaveLength(2)
  expect(requests[1]).toMatchObject({ key: 'second', types: 'url', source: 'qq', id: '42', br: '320' })
})

it('does not contact disabled providers or providers for a different platform', async () => {
  const requests = []
  const url = await upstream((req, res) => { requests.push(req.url); res.end('[]') })
  const data = await php(`try { xcloudMusicResolve('search','qq',['keyword'=>'测试']); } catch(Throwable $e) { echo json_encode(['message'=>$e->getMessage()]); }`, {
    XCLOUD_MUSIC_API_1_URL: url, XCLOUD_MUSIC_API_1_ENABLED: '0',
    XCLOUD_MUSIC_API_2_URL: url, XCLOUD_MUSIC_API_2_SOURCES: 'netease',
  })
  expect(requests).toHaveLength(0)
  expect(data.message).toContain('未配置')
})

it('treats an empty search as valid but falls back to another provider with matches', async () => {
  const url = await upstream((req, res) => {
    const empty = new URL(req.url, 'http://localhost').searchParams.get('empty') === '1'
    res.end(JSON.stringify(empty ? [] : [{ id: '42', name: '结果' }]))
  })
  const data = await php(`echo json_encode(xcloudMusicResolve('search','qq',['keyword'=>'测试']));`, {
    XCLOUD_MUSIC_API_1_URL: `${url}?empty=1`, XCLOUD_MUSIC_API_1_FORMAT: 'meting',
    XCLOUD_MUSIC_API_2_URL: url, XCLOUD_MUSIC_API_2_FORMAT: 'meting',
  })
  expect(data.data[0].id).toBe('42')
})

it('does not follow upstream redirects or disclose their URL and response body in errors', async () => {
  let hits = 0
  const url = await upstream((req, res) => { hits++; res.writeHead(302, { Location: '/secret?token=private' }); res.end('private-token') })
  const data = await php(`try { xcloudMusicResolve('url','qq',['id'=>'42']); } catch(Throwable $e) { echo json_encode(['message'=>$e->getMessage()]); }`, {
    XCLOUD_MUSIC_API_1_URL: url, XCLOUD_MUSIC_API_1_FORMAT: 'meting',
    XCLOUD_MUSIC_API_2_URL: '',
  })
  expect(hits).toBe(1)
  expect(data.message).not.toMatch(/127\.0\.0\.1|private|secret/)
})
