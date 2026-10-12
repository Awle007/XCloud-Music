import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('client entry dashboard display contract', () => {
  it('uses today visit totals while retaining 30-day unique visitor totals', () => {
    const page = fs.readFileSync(path.join(projectRoot, 'admin/index.php'), 'utf8')
    const script = fs.readFileSync(path.join(projectRoot, 'admin/assets/js/admin.js'), 'utf8')
    const endpoint = fs.readFileSync(path.join(projectRoot, 'admin/api/get_client_entry_statistics.php'), 'utf8')

    expect(page).toContain('今日访问次数')
    expect(page).toContain('近 30 日总访问次数')
    expect(page).toContain('近 30 日独立访客')
    expect(script).toContain('data.today_summary?.[type]')
    expect(script).toContain('client-entry-${type}-30d-visits')
    expect(endpoint).toContain("'today_summary' => $todaySummary")
  })
})
