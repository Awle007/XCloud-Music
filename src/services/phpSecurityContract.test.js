import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('PHP security release contract', () => {
  it('ships the shared security helper and secured endpoint overrides', () => {
    const build = read('scripts/build-release.mjs')
    expect(build).toMatch(/cpSync\(join\(deployDir, 'php'\), join\(releaseDir, 'php'\), \{\s*recursive: true\b/)
    expect(read('deploy/php/config.php')).toContain("xcloudEnv('DB_PASS')")
    expect(build).not.toContain("join(originalDir, 'php'")
    for (const name of [
      '_security.php',
      'login.php',
      'register.php',
      'register_verification.php',
      'forgot_password.php',
      'verify_email.php',
      'update_avatar.php',
    ]) {
      expect(fs.existsSync(path.join(root, 'deploy/php', name))).toBe(true)
    }
  })

  it('requires password proof before changing an unverified account email', () => {
    const source = read('deploy/php/verify_email.php')
    expect(source).toContain("password_verify($currentPassword, $user['password'])")
    expect(source).toContain("xcloudSecurityRateLimit('verify-email-change'")
    expect(source).not.toContain("'message' => '操作失败: ' . $e->getMessage()")
  })

  it('validates avatar bytes and forces a server-selected image extension', () => {
    const source = read('deploy/php/update_avatar.php')
    expect(source).toContain('finfo_file')
    expect(source).toContain('getimagesize')
    expect(source).toContain("'image/jpeg' => 'jpg'")
    expect(source).toContain("'image/png' => 'png'")
    expect(source).not.toContain("pathinfo($file['name']")
    expect(source).not.toContain("$file['type']")
  })

  it('rate limits public authentication and mail endpoints', () => {
    for (const file of ['login.php', 'register_verification.php', 'forgot_password.php']) {
      expect(read(`deploy/php/${file}`)).toContain('xcloudSecurityRateLimit(')
    }
    expect(read('deploy/php/register_verification.php')).toContain('random_int(')
    expect(read('deploy/php/forgot_password.php')).toContain("DELETE FROM user_tokens WHERE user_id = ?")
  })

  it('blocks executable uploads and web access to cron jobs', () => {
    const nginx = read('deploy/nginx.conf.example')
    const apache = read('deploy/root.htaccess')
    const build = read('scripts/build-release.mjs')
    expect(nginx).toMatch(/location\s+~\*\s+\^\/upload\/.*\\\.\(\?:php/)
    expect(apache).toContain('RewriteRule ^upload/.*\\.(?:php|phtml|phar|php[0-9]*)$ - [F,L,NC]')
    for (const file of ['update_toplist.php', 'update_xcloud_hot_toplist.php', 'send_feedback_digest.php']) {
      expect(read(`deploy/php/${file}`)).toContain("PHP_SAPI !== 'cli'")
    }
    expect(build).toContain('Possible embedded credential')
  })
})
