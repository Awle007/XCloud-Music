export function splitSearchableArtists(value) {
  return String(value || '')
    .split(/([,&])/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ type: part === ',' || part === '&' ? 'separator' : 'artist', value: part }))
}
