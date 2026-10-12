export function buildDesktopLyricsPayload(player) {
  const song = player?.currentSong
  return {
    currentSong: song ? {
      id: song.id,
      source: song.source,
      name: song.name,
      title: song.title,
      artist: Array.isArray(song.artist) ? [...song.artist] : song.artist,
    } : null,
    currentTime: Number(player?.currentTime) || 0,
    duration: Number(player?.duration) || 0,
    playing: Boolean(player?.playing),
    lyrics: Array.isArray(player?.lyrics) ? player.lyrics.map((line) => ({
      time: Number(line.time) || 0,
      text: String(line.text || ''),
      translation: String(line.translation || ''),
    })) : [],
    activeLyricIndex: Number.isInteger(player?.activeLyricIndex) ? player.activeLyricIndex : -1,
  }
}
