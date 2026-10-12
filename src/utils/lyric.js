const META_PATTERN = /^\[(ar|ti|al|by|offset|re|ve):/i
const hasCjk = (text) => /[\u3400-\u9fff]/u.test(String(text || ''))

function stampedLines(text) {
  const result = []
  String(text || '').split(/\r?\n/).forEach((line) => {
    if (!line || META_PATTERN.test(line)) return
    const matches = [...line.matchAll(/\[(?:(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?|(\d{1,5})\.(\d{1,6}))\]/g)]
    const content = line.replace(/\[[^\]]+\]/g, '').trim()
    if (!matches.length || !content) return
    matches.forEach((match) => {
      const isSecondBased = match[4] !== undefined
      const fraction = String(isSecondBased ? match[5] : match[3] || '0').padEnd(3, '0').slice(0, 3)
      result.push({
        time: isSecondBased
          ? Number(match[4]) + Number(fraction) / 1000
          : Number(match[1]) * 60 + Number(match[2]) + Number(fraction) / 1000,
        text: content,
        translation: '',
      })
    })
  })
  return result
}

function parseKuwoBilingual(lines) {
  const result = []
  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index]
    const next = lines[index + 1]
    if (next && !hasCjk(current.text) && hasCjk(next.text)) {
      result.push({ ...current, translation: next.text })
      index += 1
    } else if (next && hasCjk(current.text) && !hasCjk(next.text) && Math.abs(current.time - next.time) < 0.1) {
      result.push({ time: current.time, text: next.text, translation: current.text })
      index += 1
    } else result.push(current)
  }
  return result.sort((a, b) => a.time - b.time)
}

export function parseLyric(text, options = {}) {
  const lines = stampedLines(text)
  if (options.preferNonCjk) return parseKuwoBilingual(lines)

  const timeline = new Map()
  lines.forEach((line) => {
    const key = line.time.toFixed(3)
    const existing = timeline.get(key)
    if (!existing) timeline.set(key, line)
    else if (existing.text !== line.text && !existing.translation) existing.translation = line.text
  })
  return [...timeline.values()].sort((a, b) => a.time - b.time)
}

export function findActiveLyricIndex(lines, time, offset = 0) {
  const adjusted = time + offset
  let active = -1
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time > adjusted) break
    active = index
  }
  return active
}
