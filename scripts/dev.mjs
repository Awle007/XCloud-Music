import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { existsSync } from 'node:fs'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backendDir = join(projectDir, 'deploy', 'php')
const viteBin = join(projectDir, 'node_modules', 'vite', 'bin', 'vite.js')
const children = []
let closing = false

function portIsOpen(port) {
  return new Promise((resolveOpen) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.once('connect', () => { socket.destroy(); resolveOpen(true) })
    socket.once('error', () => resolveOpen(false))
    socket.setTimeout(400, () => { socket.destroy(); resolveOpen(false) })
  })
}

function stopChildren() {
  if (closing) return
  closing = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

if (!existsSync(backendDir)) {
  console.error(`[XCloud] 找不到 PHP 源码目录：${backendDir}`)
  process.exit(1)
}

if (await portIsOpen(8080)) {
  console.log('[XCloud] 检测到 127.0.0.1:8080 已有服务，将直接复用。')
} else {
  const php = spawn('php', ['-S', '127.0.0.1:8080', '-t', 'public', 'scripts/php-router.php'], {
    cwd: projectDir,
    stdio: 'inherit',
    windowsHide: true,
  })
  children.push(php)
  php.once('error', (error) => {
    console.error(`[XCloud] PHP 服务启动失败：${error.message}`)
    console.error('[XCloud] 请确认 php 命令已加入 PATH。')
    stopChildren()
    process.exitCode = 1
  })
  php.once('exit', (code) => {
    if (!closing && code) console.error(`[XCloud] PHP 服务异常退出（${code}）。`)
  })
}

const vite = spawn(process.execPath, [viteBin], {
  cwd: projectDir,
  stdio: 'inherit',
  windowsHide: true,
})
children.push(vite)
vite.once('exit', (code) => {
  stopChildren()
  process.exitCode = code ?? 0
})

process.on('SIGINT', () => { stopChildren(); process.exit(0) })
process.on('SIGTERM', () => { stopChildren(); process.exit(0) })
process.on('exit', stopChildren)
