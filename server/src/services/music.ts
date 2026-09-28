import { musicPosition, musicStations, musicTracks, resolveMusic, type MusicCommand, type MusicState, type MusicUpdate } from '../music/catalog.js'

export function createMusic(broadcast: (update: MusicUpdate) => void, now = () => Date.now()) {
  const rooms = new Map<string, MusicState>()
  const idle = new Map<string, ReturnType<typeof setTimeout>>()
  function snapshot(roomCode: string): MusicUpdate {
    let music = rooms.get(roomCode)
    if (!music) {
      music = { stationId: 'cafe', status: 'paused', offsetSeconds: 0, startedAt: null, revision: 0 }
      rooms.set(roomCode, music)
    }
    return { roomCode, music: { ...music }, serverNow: now() }
  }
  return {
    snapshot,
    forget(roomCode: string) {
      clearTimeout(idle.get(roomCode))
      idle.delete(roomCode)
      rooms.delete(roomCode)
    },
    act(roomCode: string, command: MusicCommand) {
      const { music, serverNow } = snapshot(roomCode)
      const current = resolveMusic(music, serverNow)
      music.offsetSeconds = musicPosition(music, serverNow) % current.duration
      if (command.action === 'station') {
        if (!musicStations.some(station => station.id === command.stationId)) throw new Error('Unknown station')
        music.stationId = command.stationId
        music.offsetSeconds = 0
      } else if (command.action === 'next') {
        music.offsetSeconds = (music.offsetSeconds + current.track.duration - current.position) % current.duration
      } else if (command.action === 'previous') {
        if (current.trackIndex === 0) return snapshot(roomCode)
        music.offsetSeconds = current.station.tracks.slice(0, current.trackIndex - 1)
          .reduce((offset, id) => offset + musicTracks.find(track => track.id === id)!.duration, 0)
      } else music.status = command.action === 'play' ? 'playing' : 'paused'
      music.startedAt = music.status === 'playing' ? serverNow : null
      music.revision++
      rooms.set(roomCode, music)
      const update = snapshot(roomCode)
      broadcast(update)
      return update
    },
    presence(roomCode: string, occupied: boolean) {
      clearTimeout(idle.get(roomCode))
      idle.delete(roomCode)
      if (!occupied) {
        const timeout = setTimeout(() => { rooms.delete(roomCode); idle.delete(roomCode) }, 60_000)
        timeout.unref()
        idle.set(roomCode, timeout)
      }
    },
    dispose() {
      for (const timeout of idle.values()) clearTimeout(timeout)
      idle.clear()
      rooms.clear()
    },
  }
}
