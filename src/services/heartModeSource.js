import { searchMusic, getSimilarSongs } from './musicSource'
import { isSourceEnabled, isFeatureEnabled } from './runtimeConfig'
const MAX_ARTIST_PER_BATCH = 3
const PREFERRED_ARTIST_PER_BATCH = 2
const MAX_HEARD_PER_BATCH = 4

function normalizeSong(song, source) {
  const artists = Array.isArray(song?.artist)
    ? song.artist.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean).join(', ')
    : Array.isArray(song?.artists)
      ? song.artists.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean).join(', ')
      : String(song?.artist || song?.singer || '')
  return {
    id: String(song?.id ?? song?.songid ?? song?.songmid ?? ''),
    source: String(song?.source || source).toLowerCase(),
    name: String(song?.name || song?.title || ''),
    artist: artists,
    album: String(song?.album || song?.albumName || ''),
    pic_id: String(song?.pic_id || song?.picId || song?.cover || song?.coverUrl || ''),
    url_id: String(song?.url_id || song?.id || song?.songid || song?.songmid || ''),
    lyric_id: String(song?.lyric_id || song?.id || song?.songid || song?.songmid || ''),
    origin: 'source_search',
  }
}

async function requestFirstParty(source, queryText, signal, resultLimit) {
  if (!isSourceEnabled(source)) return []
  return searchMusic(source, queryText, 1, resultLimit, signal)
}
async function requestNeteaseSimilar(songId, signal) {
  if (!isSourceEnabled('netease')) return []
  return getSimilarSongs({ source: 'netease', id: songId }, signal)
}

function artistTokens(value) {
  return String(value || '')
    .normalize('NFKC')
    .split(/[,，、&\uFF06\/;|]|\b(?:feat|ft)\.?\b/iu)
    .map((item) => item.replace(/[\p{P}\p{S}\s]+/gu, '').toLocaleLowerCase())
    .filter(Boolean)
}

function sourceArtistKey(source, artist) {
  return `${String(source || '').toLowerCase()}:${artistTokens(artist).sort().join('|')}`
}

function matchesTargetArtist(resultArtist, targetArtist) {
  const targets = artistTokens(targetArtist)
  if (!targets.length) return true
  const result = artistTokens(resultArtist)
  return targets.some((target) => result.some((item) => item === target))
}

function filterSearchRows(rows, source, targets) {
  return rows
    .map((song) => ({ ...normalizeSong(song, source), heart_targets: targets }))
    .filter((song) => song.id && song.name && song.pic_id)
    .filter((song) => !isLiveSong(song.name))
    .filter((song) => targets.some((target) => matchesTargetArtist(song.artist, target.artist)))
}

function isLiveSong(title) {
  return /\blive\b|live\u7248|\u73b0\u573a|\u6f14\u5531\u4f1a|\u4f34\u594f|instrumental|karaoke/iu.test(String(title || '').normalize('NFKC'))
}

async function searchFirstPartyOne(item, signal, resultLimit) {
  const source = String(item?.source || '').toLowerCase()
  const query = String(item?.query || item?.artist || '').trim()
  if (item?.mode === 'similar') {
    const rows = await requestNeteaseSimilar(item.song_id, signal)
    const songs = filterSearchRows(rows, 'netease', [{ group: item.group, bucket: item.bucket, artist: '' }])
    if (!songs.length) return []
    return [songs[Math.floor(Math.random() * songs.length)]]
  }
  if (!isSourceEnabled(source) || !query) return []
  const targets = item.targets || [{ bucket: item.bucket, group: item.group, artist: item.target_artist || item.artist }]
  const rows = await requestFirstParty(source, query, signal, resultLimit)
  return filterSearchRows(rows, source, targets)
}

export async function searchHeartModeSources(context = [], { signal, maxQueries = 10, resultLimit = 50 } = {}) {
  if (!isFeatureEnabled('heartMode')) return []
  const queries = []
  const seen = new Map()
  for (const item of Array.isArray(context) ? context : []) {
    const source = String(item?.source || '').toLowerCase()
    if (!isSourceEnabled(source)) continue
    const artist = String(item?.artist || '').trim()
    const query = String(item?.query || artist).trim()
    const key = item?.mode === 'similar'
      ? `${source}:similar:${String(item.song_id || '').toLocaleLowerCase()}`
      : `${source}:${query.toLocaleLowerCase()}`
    if (!query && item?.mode !== 'similar') continue
    const target = {
      bucket: item.bucket,
      group: item.group,
      artist: String(item.target_artist || item.artist || '').trim(),
      title: String(item.target_title || '').trim(),
    }
    if (seen.has(key)) {
      seen.get(key).targets.push(target)
      continue
    }
    const queryItem = { ...item, source, artist, query, targets: [target] }
    seen.set(key, queryItem)
    queries.push(queryItem)
    if (queries.length >= maxQueries) break
  }
  const boundedLimit = Math.max(1, Math.min(100, Number(resultLimit) || 50))
  const results = await Promise.all(queries.map(async (query) => {
    try { return await searchFirstPartyOne(query, signal, boundedLimit) }
    catch (error) {
      if (error?.name === 'AbortError') throw error
      return []
    }
  }))
  return results.flat()
}

function pickRankedItem(items, random, usedArtists = new Map(), getArtist = (item) => item?.artist || item?.name) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return null
  const diverseList = list.filter((item) => artistTokens(getArtist(item)).every((artist) => (usedArtists.get(artist) || 0) < 1))
  const candidateList = diverseList.length ? diverseList : list
  const roll = random()
  const band = roll < 0.55 ? [0, 15] : roll < 0.95 ? [15, 30] : [30, 50]
  const available = candidateList.slice(band[0], Math.min(band[1], candidateList.length))
  const pool = available.length ? available : candidateList.slice(0, Math.min(50, candidateList.length))
  return pool[Math.floor(random() * pool.length)] || pool[0]
}

export function buildHeartModeSearchPlan(priority = {}, random = Math.random, excludedArtistKeys = new Set()) {
  const historySeeds = (Array.isArray(priority?.songs?.history) ? priority.songs.history : [])
    .slice(0, 50)
    .filter((item) => String(item?.source || '').toLowerCase() === 'netease' && String(item?.id || '').trim())
  const similarSeeds = []
  const availableSeeds = [...historySeeds]
  while (similarSeeds.length < 2 && availableSeeds.length) {
    const index = Math.min(availableSeeds.length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * availableSeeds.length))
    similarSeeds.push(availableSeeds.splice(index, 1)[0])
  }
  const missingSimilarSlots = 2 - similarSeeds.length
  const songArtists = [
    ...(Array.isArray(priority?.songs?.history) ? priority.songs.history : []),
    ...(Array.isArray(priority?.songs?.library) ? priority.songs.library : []),
  ]
  const groups = [
    { group: 2, list: priority?.artists?.history, countNew: 2, countHeard: 1, query: (item) => item.name },
    { group: 3, list: priority?.artists?.library, countNew: 2, countHeard: 1, query: (item) => item.name },
    { group: 4, list: songArtists, countNew: 1 + Math.ceil(missingSimilarSlots / 2), countHeard: 1 + Math.floor(missingSimilarSlots / 2), query: (item) => item.artist },
  ]
  const plan = []
  const usedArtists = new Map()
  for (const item of similarSeeds) {
    plan.push({
      mode: 'similar',
      source: 'netease',
      song_id: String(item.id),
      artist: '',
      target_artist: '',
      target_title: String(item.name || '').trim(),
      query: '',
      group: 1,
      bucket: 'similar',
      rank: (Array.isArray(priority?.songs?.history) ? priority.songs.history.indexOf(item) : -1) + 1,
    })
  }
  for (const definition of groups) {
    for (const bucket of ['new', 'heard']) {
      const count = bucket === 'new' ? definition.countNew : definition.countHeard
      for (let index = 0; index < count; index += 1) {
        const getArtist = (candidate) => definition.group <= 3 ? candidate?.name : candidate?.artist
        const candidates = (Array.isArray(definition.list) ? definition.list : []).filter((candidate) => {
          return !excludedArtistKeys.has(sourceArtistKey(candidate?.source, getArtist(candidate)))
        })
        const item = pickRankedItem(candidates, random, usedArtists, getArtist)
        if (!item) continue
        artistTokens(definition.group <= 3 ? item.name : item.artist).forEach((artist) => usedArtists.set(artist, (usedArtists.get(artist) || 0) + 1))
        plan.push({
          source: String(item.source || '').toLowerCase(),
          artist: String(item.artist || item.name || '').trim(),
          target_artist: String(definition.group <= 3 ? item.name : item.artist || '').trim(),
          target_title: String(definition.group >= 3 ? item.name : '').trim(),
          query: definition.query(item),
          group: definition.group,
          bucket,
          rank: (Array.isArray(definition.list) ? definition.list.indexOf(item) : -1) + 1,
        })
      }
    }
  }
  return plan
}

export function findExhaustedHeartModeArtists(plan = [], searchSongs = [], profileCandidates = []) {
  const profileByKey = new Map()
  const profileByIdentity = new Map()
  for (const candidate of Array.isArray(profileCandidates) ? profileCandidates : []) {
    profileByKey.set(songKey(candidate), candidate)
    profileByIdentity.set(identity(candidate), candidate)
  }
  const exhausted = new Set()
  const targets = new Map()
  for (const item of Array.isArray(plan) ? plan : []) {
    if (item?.mode === 'similar') continue
    const key = sourceArtistKey(item?.source, item?.target_artist || item?.artist)
    if (key && !targets.has(key)) targets.set(key, item)
  }
  for (const [key, target] of targets) {
    const rows = (Array.isArray(searchSongs) ? searchSongs : []).filter((song) => {
      if (String(song?.source || '').toLowerCase() !== String(target?.source || '').toLowerCase()) return false
      const heartTargets = Array.isArray(song?.heart_targets) ? song.heart_targets : []
      return heartTargets.some((searchTarget) => (
        searchTarget?.group === target?.group &&
        searchTarget?.bucket === target?.bucket &&
        matchesTargetArtist(searchTarget?.artist, target?.target_artist || target?.artist)
      ))
    })
    if (!rows.length) continue
    if (rows.every((song) => Boolean(profileByKey.get(songKey(song))?.heard || profileByIdentity.get(identity(song))?.heard))) {
      exhausted.add(key)
    }
  }
  return exhausted
}

function identity(song) {
  const normalize = (value) => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
  const artists = artistTokens(song?.artist).map(normalize).filter(Boolean).sort()
  return `${normalize(song?.name || song?.title)}|${artists.join('|')}`
}

function songKey(song) { return `${String(song?.source || 'netease').toLowerCase()}:${String(song?.id || '')}` }

export function selectHeartModeSongs(searchSongs = [], fallbackSongs = [], profileCandidates = [], excludeKeys = [], limit = 10, quotaPlan = [], random = Math.random) {
  // Filter transient recommendation inputs; retain the caller's library and stored profile unchanged.
  const enabledSongs = (songs) => (Array.isArray(songs) ? songs : []).filter((song) => isSourceEnabled(song?.source || 'netease'))
  searchSongs = enabledSongs(searchSongs)
  fallbackSongs = enabledSongs(fallbackSongs)
  profileCandidates = enabledSongs(profileCandidates)
  const excluded = new Set((Array.isArray(excludeKeys) ? excludeKeys : []).map(String))
  const profileByKey = new Map()
  const profileByIdentity = new Map()
  for (const candidate of Array.isArray(profileCandidates) ? profileCandidates : []) {
    profileByKey.set(songKey(candidate), candidate)
    profileByIdentity.set(identity(candidate), candidate)
  }
  const searchedIdentities = new Set((Array.isArray(searchSongs) ? searchSongs : []).map(identity))
  const merged = []
  const seenKeys = new Set()
  const seenIdentities = new Set()
  for (const song of [...(Array.isArray(searchSongs) ? searchSongs : []), ...(Array.isArray(fallbackSongs) ? fallbackSongs : [])]) {
    const key = songKey(song)
    const songIdentity = identity(song)
    if (!song?.id || !song?.name || !song?.pic_id || isLiveSong(song.name) || excluded.has(key) || seenKeys.has(key) || seenIdentities.has(songIdentity)) continue
    const profile = profileByKey.get(key) || profileByIdentity.get(songIdentity)
    if (profile && !profile.heard && profile.origin !== 'source_search' && song.origin === 'source_search') continue
    if (profile && !profile.heard && profile.origin !== 'source_search' && song.origin !== 'source_search' && searchedIdentities.has(songIdentity)) continue
    const isSimilar = Array.isArray(song.heart_targets) && song.heart_targets.some((target) => target?.bucket === 'similar')
    merged.push({
      ...song,
      heard: Boolean(profile?.heard),
      origin: profile?.origin || song.origin || 'library',
      classification: isSimilar ? 'similar' : profile?.heard ? 'heard' : profile ? 'library' : 'new',
      rankScore: isSimilar ? 4 : profile?.origin === 'source_search' || (!profile && song.origin === 'source_search') ? 3 : profile?.heard ? 2 : 1,
    })
    seenKeys.add(key)
    seenIdentities.add(songIdentity)
  }
  merged.sort((left, right) => right.rankScore - left.rankScore)
  const result = []
  const selectedKeys = new Set()
  const artistCounts = new Map()
  let heardCount = 0
  const append = (song, enforceCap = true, avoidAdjacent = false, maxPerArtist = MAX_ARTIST_PER_BATCH) => {
    if (result.length >= limit) return
    const key = songKey(song)
    if (selectedKeys.has(key)) return
    if (song.classification === 'heard' && heardCount >= MAX_HEARD_PER_BATCH) return
    const artist = String(song.artist || '').trim()
    const artists = artistTokens(artist)
    if (enforceCap && artists.some((item) => (artistCounts.get(item) || 0) >= maxPerArtist)) return
    if (avoidAdjacent && artists.length && artistTokens(result.at(-1)?.artist).some((item) => artists.includes(item))) return
    result.push(song)
    selectedKeys.add(key)
    artists.forEach((item) => artistCounts.set(item, (artistCounts.get(item) || 0) + 1))
    if (song.classification === 'heard') heardCount += 1
  }
  const planTargets = []
  for (const target of Array.isArray(quotaPlan) ? quotaPlan : []) {
    const key = `${target.group}:${target.bucket}`
    if (!planTargets.some((item) => item.key === key)) planTargets.push({ key, ...target, count: 0 })
    planTargets.find((item) => item.key === key).count += 1
  }
  for (const target of planTargets) {
    const matching = merged.filter((song) => {
      const targets = Array.isArray(song.heart_targets) ? song.heart_targets : []
      return targets.some((item) => item.group === target.group && item.bucket === target.bucket) && song.classification === target.bucket
    })
    const available = [...matching]
    for (let index = 0; index < target.count && available.length; index += 1) {
      const randomIndex = Math.min(available.length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * available.length))
      const [song] = available.splice(randomIndex, 1)
      append(song, true, false, PREFERRED_ARTIST_PER_BATCH)
    }
  }
  if (!planTargets.length) merged.forEach((song) => append(song, true, false, PREFERRED_ARTIST_PER_BATCH))
  if (result.length < limit) {
    const fallbackPool = merged
    for (const maxPerArtist of [PREFERRED_ARTIST_PER_BATCH, MAX_ARTIST_PER_BATCH]) {
      let added = true
      while (result.length < limit && added) {
        added = false
        const candidates = fallbackPool
          .filter((song) => !selectedKeys.has(songKey(song)))
          .sort((left, right) => {
            const leftArtists = artistTokens(left.artist)
            const rightArtists = artistTokens(right.artist)
            const leftLoad = leftArtists.length ? Math.max(...leftArtists.map((artist) => artistCounts.get(artist) || 0)) : 0
            const rightLoad = rightArtists.length ? Math.max(...rightArtists.map((artist) => artistCounts.get(artist) || 0)) : 0
            return leftLoad - rightLoad || right.rankScore - left.rankScore
          })
        for (const song of candidates) {
          const before = result.length
          append(song, true, false, maxPerArtist)
          if (result.length > before) {
            added = true
            if (result.length >= limit) break
          }
        }
      }
    }
  }
  return result.slice(0, limit).map((song, index) => ({ ...song, rank: index + 1 }))
}
