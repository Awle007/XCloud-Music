export function createShuffleOrder(length, currentIndex = -1, random = Math.random) {
  const indices = Array.from({ length: Math.max(0, Number(length) || 0) }, (_, index) => index)
  return createShuffleOrderForIndices(indices, currentIndex, random)
}

export function createShuffleOrderForIndices(indices, currentIndex = -1, random = Math.random) {
  const source = Array.isArray(indices) ? indices : []
  const current = Number(currentIndex)
  const hasCurrent = source.includes(current)
  const rest = hasCurrent ? source.filter((index) => index !== current) : [...source]

  for (let index = rest.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.max(0, Math.min(1, Number(random()))) * (index + 1))
    ;[rest[index], rest[swapIndex]] = [rest[swapIndex], rest[index]]
  }

  return hasCurrent ? [current, ...rest] : rest
}

export function advanceShuffleOrder(length, currentIndex, random = Math.random) {
  const order = createShuffleOrder(length, currentIndex, random)
  const position = order.length > 1 ? 1 : 0
  return { order, position, index: order[position] }
}

export function insertAfterCurrent(queue, currentIndex, song) {
  const items = Array.isArray(queue) ? [...queue] : []
  const position = Math.max(0, Math.min(Number(currentIndex) || 0, items.length - 1)) + 1
  items.splice(position, 0, song)
  return items
}

function sameSong(left, right) {
  return String(left?.source || 'netease') === String(right?.source || 'netease')
    && String(left?.id || '') === String(right?.id || '')
}

export function moveAfterCurrent(queue, currentIndex, song) {
  const items = Array.isArray(queue) ? [...queue] : []
  let index = Math.max(0, Math.min(Number(currentIndex) || 0, items.length - 1))
  if (!song?.id || !items.length) return { queue: items, currentIndex: index, moved: false, alreadyCurrent: false }
  if (sameSong(items[index], song)) return { queue: items, currentIndex: index, moved: false, alreadyCurrent: true }

  for (let position = items.length - 1; position >= 0; position -= 1) {
    if (!sameSong(items[position], song)) continue
    items.splice(position, 1)
    if (position < index) index -= 1
  }
  items.splice(index + 1, 0, song)
  return { queue: items, currentIndex: index, moved: true, alreadyCurrent: false }
}
