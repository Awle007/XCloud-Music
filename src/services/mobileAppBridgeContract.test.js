import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const hostSource = fs.readFileSync(path.join(root, 'MobileApp/app.js'), 'utf8')
const hybridSource = fs.readFileSync(path.join(root, 'MobileApp/hybrid/html/app.js'), 'utf8')
const appManifest = JSON.parse(fs.readFileSync(path.join(root, 'MobileApp/manifest.json'), 'utf8'))
const updateManifest = JSON.parse(fs.readFileSync(path.join(root, 'download/app-version.json'), 'utf8'))

describe('MobileApp bridge source contract', () => {
  it('keeps both maintained bridge copies identical', () => {
    expect(hybridSource).toBe(hostSource)
  })

  it('asks the website to handle back before entering the native exit flow', () => {
    expect(hostSource).toContain("sendToWeb('app.back', { backId: pendingBackId })")
    expect(hostSource).toContain("case 'app.back.result':")
    expect(hostSource).toContain("if (!payload?.handled) handleHomeBackExit()")
  })

  it('keeps packaged and remote update versions aligned', () => {
    expect(updateManifest.versionName).toBe(appManifest.versionName)
    expect(updateManifest.versionCode).toBe(appManifest.versionCode)
  })
})
