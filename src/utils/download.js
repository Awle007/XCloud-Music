import { androidAppBridge } from '../services/androidAppBridge'

const DOWNLOAD_SITE_NAME = 'XCloud音乐'
const DOWNLOAD_SITE_URL = 'https://example.com/'
const DOWNLOAD_SITE_NOTICE = `歌曲来自${DOWNLOAD_SITE_NAME}（${DOWNLOAD_SITE_URL}），资源免费下载试听，请支持正版音乐。`

export function getAudioExtension(url, declaredType = '', mimeType = '') {
  const mime = String(mimeType || '').toLowerCase().split(';')[0].trim()
  if (mime === 'audio/mp4' || mime === 'video/mp4' || mime === 'audio/x-m4a') return 'm4a'
  if (mime.includes('flac')) return 'flac'
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'mp3'
  if (mime.includes('aac')) return 'aac'
  if (mime.includes('ogg')) return 'ogg'
  let value = String(url || '').toLowerCase()
  try { value = decodeURIComponent(value) } catch { /* Keep the original URL when percent encoding is malformed. */ }
  if (value.includes('format$flac') || value.includes('.flac')) return 'flac'
  if (value.includes('format$m4a') || value.includes('.m4a')) return 'm4a'
  if (value.includes('format$mp3') || value.includes('.mp3')) return 'mp3'
  if (value.includes('format$aac') || value.includes('.aac')) return 'aac'
  if (value.includes('format$ogg') || value.includes('.ogg')) return 'ogg'
  const declared = String(declaredType || '').toLowerCase().replace(/^audio\//, '').replace(/^\./, '').trim()
  if (declared === 'mp4' || declared === 'x-m4a') return 'm4a'
  if (['flac', 'm4a', 'mp3', 'aac', 'ogg'].includes(declared)) return declared
  return 'mp3'
}

export function buildSongFileName(song, extension = 'mp3') {
  const title = song?.title || song?.name || 'music'
  const artist = Array.isArray(song?.artist) ? song.artist.join(' & ') : song?.artist || '未知歌手'
  return `${title} - ${artist}.${extension}`
}

export function normalizeDownloadLyric(lyricText) {
  const text = String(lyricText || '').replace(/\[(\d{1,3}):(\d{2})\.(\d+)\]/g, (timestamp, minutes, seconds, fraction) => {
    const milliseconds = fraction.slice(0, 3).padEnd(3, '0')
    return `[${minutes.padStart(2, '0')}:${seconds}.${milliseconds}]`
  }).trim()
  if (!text || text.includes(DOWNLOAD_SITE_URL) || text.includes(DOWNLOAD_SITE_NOTICE)) return text
  return `[00:00.000]${DOWNLOAD_SITE_NOTICE}\n${text}`
}

function triggerBlobDownload(blob, fileName) {
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(blob)
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(anchor.href)
}

function triggerDirectDownload(url, fileName) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.target = '_blank'
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function syncsafe(size) {
  return [(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]
}

function makeId3Frame(id, payload) {
  return new Uint8Array([...id].map((char) => char.charCodeAt(0)).concat(syncsafe(payload.length), [0, 0], [...payload]))
}

function makeTextFrame(id, text) {
  return makeId3Frame(id, new Uint8Array([3, ...new TextEncoder().encode(String(text || ''))]))
}

function makeCommentFrame(text) {
  const encoder = new TextEncoder()
  return makeId3Frame('COMM', new Uint8Array([3, ...encoder.encode('chi'), 0, ...encoder.encode(String(text || ''))]))
}

async function embedMp3Metadata(blob, song, lyricText) {
  const lyrics = normalizeDownloadLyric(lyricText)
  const artist = Array.isArray(song?.artist) ? song.artist.join(' & ') : song?.artist || ''
  const frames = [
    makeTextFrame('TIT2', song?.title || song?.name || ''),
    makeTextFrame('TPE1', artist),
    makeTextFrame('TENC', DOWNLOAD_SITE_NAME),
    makeCommentFrame(DOWNLOAD_SITE_NOTICE),
    makeId3Frame('WOAS', new TextEncoder().encode(DOWNLOAD_SITE_URL)),
  ]
  if (lyrics) frames.push(makeId3Frame('USLT', new Uint8Array([3, ...new TextEncoder().encode('chi'), 0, ...new TextEncoder().encode(lyrics)])))
  const frameSize = frames.reduce((sum, frame) => sum + frame.length, 0)
  const header = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, ...syncsafe(frameSize)])
  let audioBlob = blob
  const head = new Uint8Array(await blob.slice(0, 10).arrayBuffer())
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    const oldSize = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f)
    audioBlob = blob.slice(oldSize + 10)
  }
  return new Blob([header, ...frames, audioBlob], { type: 'audio/mpeg' })
}

function downloadLyric(lyricText, song) {
  const text = normalizeDownloadLyric(lyricText)
  if (!text) return
  triggerBlobDownload(new Blob([text], { type: 'text/plain;charset=utf-8' }), buildSongFileName(song, 'lrc'))
}

export async function downloadSongDirect(url, song, lyricText = '', audioData = {}) {
  let extension = getAudioExtension(url, audioData?.type, audioData?.mimeType || audioData?.contentType)
  let fileName = buildSongFileName(song, extension)
  if (androidAppBridge.isAppMode()) {
    await androidAppBridge.request('download.start', {
      url,
      fileName,
      lyricFileName: buildSongFileName(song, 'lrc'),
      lyricText: normalizeDownloadLyric(lyricText),
      song: {
        id: song?.id,
        source: song?.source,
        name: song?.name || song?.title,
        artist: song?.artist,
        album: song?.album,
      },
    })
    return
  }
  let lyricEmbedded = false
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('音频直链请求失败')
    let blob = await response.blob()
    extension = getAudioExtension(url, audioData?.type, response.headers?.get?.('Content-Type') || blob.type)
    fileName = buildSongFileName(song, extension)
    if (extension === 'mp3') {
      blob = await embedMp3Metadata(blob, song, lyricText)
      lyricEmbedded = Boolean(lyricText)
    }
    triggerBlobDownload(blob, fileName)
  } catch {
    triggerDirectDownload(url, fileName)
  }
  if (lyricText && !lyricEmbedded) downloadLyric(lyricText, song)
}
