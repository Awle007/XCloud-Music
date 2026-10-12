import fs from 'node:fs'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

it('shows only enabled platforms, including optional Kugou, in the standalone status page', async () => {
  document.body.innerHTML = '<div id="content"></div>'
  const page = fs.readFileSync(path.join(process.cwd(), 'api_check/check_api.php'), 'utf8')
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1].split('// 页面加载时获取数据')[0]
  vi.stubGlobal('fetch', vi.fn(async (url) => ({ ok: true, json: async () => url.includes('public_config')
    ? { features: { sources: { netease: false, kuwo: false, qq: true, kugou: true } } }
    : { qq: { name: 'QQ', search: 'true', play: 'true' }, kugou: { name: '酷狗', search: 'true', play: 'true' }, netease: { name: '网易' } } })))
  await new Function(`${script}; return loadAPIStatus();`)()
  expect(document.getElementById('content').textContent).toContain('酷狗')
  expect(document.getElementById('content').textContent).toContain('QQ')
  expect(document.getElementById('content').textContent).not.toContain('网易')
})

it('uses the shared gateway for CLI health checks without separate upstream configuration', () => {
  const schedule = fs.readFileSync(path.join(process.cwd(), 'deploy/api_check/check_api_schedule.php'), 'utf8')
  expect(schedule).toContain('xcloudMusicResolve(')
  expect(schedule).toContain("$features['sources']")
  expect(schedule).toContain("PHP_SAPI !== 'cli'")
  expect(schedule).not.toContain('https://api.example.com')
})
