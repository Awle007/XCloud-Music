const LABELS = {
  '128': '省流音质',
  '192': '标准音质',
  '320': '极高[HQ]',
  '999': '无损[SQ]',
  kg_1: '128K',
  kg_2: '320K',
  kg_3: '无损音质',
  kg_4: '蝰蛇全景声',
  kg_5: '蝰蛇超清音质',
}

const STANDARD_RANK = { '128': 0, '192': 1, '320': 2, '999': 3 }

export function qualityLabel(quality) {
  return LABELS[String(quality || '')] || '标准音质'
}

function bitrateQuality(rawBitrate) {
  let bitrate = Number(rawBitrate)
  if (!Number.isFinite(bitrate) || bitrate <= 0) return ''
  if (bitrate > 10000) bitrate /= 1000
  if (bitrate >= 400) return '999'
  if (bitrate >= 320) return '320'
  if (bitrate >= 192) return '192'
  return '128'
}

function extractBitrate(audioData) {
  const candidates = [
    audioData?.br,
    audioData?.bitrate,
    audioData?.bitRate,
    audioData?.quality?.br,
    audioData?.quality?.bitrate,
    audioData?.data?.br,
    audioData?.data?.bitrate,
    audioData?.result?.br,
    audioData?.result?.bitrate,
  ]
  return candidates.find((value) => Number.isFinite(Number(value)) && Number(value) > 0)
}

function extractSourceLevel(audioData) {
  const candidates = [audioData?.yz, audioData?.quality?.yz, audioData?.data?.yz, audioData?.result?.yz]
  return candidates.find((value) => Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 5)
}

export function resolvePlaybackQuality(source, requestedQuality, audioData = {}) {
  const requested = String(requestedQuality || '320')
  let actual = requested
  let downgraded = false

  if (source === 'kugou' && /^kg_[1-5]$/.test(requested)) {
    const requestedLevel = Number(requested.slice(3))
    const actualLevel = Number(extractSourceLevel(audioData))
    if (actualLevel >= 1 && actualLevel <= 5) {
      actual = `kg_${actualLevel}`
      downgraded = actualLevel < requestedLevel
    }
  } else if (STANDARD_RANK[requested] !== undefined) {
    const detected = bitrateQuality(extractBitrate(audioData))
    if (detected) {
      actual = detected
      downgraded = STANDARD_RANK[actual] < STANDARD_RANK[requested]
    }
  }

  return {
    requested,
    actual,
    requestedName: qualityLabel(requested),
    actualName: qualityLabel(actual),
    downgraded,
  }
}
