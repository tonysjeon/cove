export const musicTracks = [
  { id: 'a-cup-of-tea', title: 'A cup of tea', duration: 168.751 },
  { id: 'cat-caffe', title: 'Cat caffe', duration: 133.0155 },
  { id: 'rainy-forest', title: 'Rainy Forest', duration: 99.552667 },
  { id: 'morning-rain', title: 'Morning rain', duration: 64.05225 },
  { id: 'countryside', title: 'Countryside', duration: 92.186125 },
  { id: 'oceanside', title: 'Oceanside', duration: 102.609 },
] as const

export const musicStations = [
  { id: 'cafe', name: 'Café', description: 'Easy lo-fi beats', tracks: ['a-cup-of-tea', 'cat-caffe'] },
  { id: 'rain', name: 'Rainy day', description: 'Soft, rainy-day loops', tracks: ['rainy-forest', 'morning-rain'] },
  { id: 'afternoon', name: 'Slow afternoon', description: 'Laid-back study beats', tracks: ['countryside', 'oceanside'] },
] as const

export type StationId = typeof musicStations[number]['id']
export type MusicState = { stationId: StationId; status: 'playing' | 'paused'; offsetSeconds: number; startedAt: number | null; revision: number }
export type MusicUpdate = { roomCode: string; music: MusicState; serverNow: number }
export type MusicCommand = { action: 'play' | 'pause' | 'previous' | 'next' } | { action: 'station'; stationId: StationId }
export type MusicResult = { success: true; state: MusicUpdate } | { success: false; error: 'NOT_IN_ROOM' | 'INVALID_MUSIC_COMMAND' | 'MUSIC_FAILED' }

export function musicPosition(state: MusicState, now: number) {
  return state.offsetSeconds + (state.status === 'playing' && state.startedAt !== null ? Math.max(0, now - state.startedAt) / 1000 : 0)
}

export function resolveMusic(state: MusicState, now: number) {
  const station = musicStations.find(item => item.id === state.stationId)!
  const tracks = station.tracks.map(id => musicTracks.find(track => track.id === id)!)
  const duration = tracks.reduce((sum, track) => sum + track.duration, 0)
  let position = musicPosition(state, now) % duration
  for (const [trackIndex, track] of tracks.entries()) {
    if (position < track.duration) return { station, track, trackIndex, position, duration }
    position -= track.duration
  }
  return { station, track: tracks[0], trackIndex: 0, position: 0, duration }
}
