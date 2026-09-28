import { useEffect, useRef, useState } from 'react'
import { socket } from '../socket/socket'
import { musicStations, resolveMusic, type MusicCommand, type MusicUpdate } from '../../../server/src/music/catalog'

type Receipt = { update: MusicUpdate; at: number }
function savedVolume() {
  try {
    const value = localStorage.getItem('cove:music-volume')
    const parsed = value === null ? .35 : Number(value)
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : .35
  } catch { return .35 }
}

export function useRoomMusic(roomCode: string, joined: boolean) {
  const [update, setUpdate] = useState<MusicUpdate | null>(null)
  const [trackTitle, setTrackTitle] = useState('')
  const [trackIndex, setTrackIndex] = useState(0)
  const [volume, setVolume] = useState(savedVolume)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [audioError, setAudioError] = useState('')
  const receipt = useRef<Receipt | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const blocked = useRef(false)
  const connected = useRef(joined)
  const volumeRef = useRef(volume)
  const synchronize = useRef<() => void>(() => {})
  const refresh = useRef<() => void>(() => {})
  const receive = useRef<(state: MusicUpdate, latency?: number) => void>(() => {})
  const generation = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    let active = true
    let playing: Promise<void> | null = null
    let source = ''
    let syncing = false
    const element = new Audio()
    element.preload = 'none'
    element.volume = volumeRef.current
    audio.current = element

    function sync() {
      const latest = receipt.current
      if (!active || !latest || !connected.current) { element.pause(); return }
      const current = resolveMusic(latest.update.music, latest.update.serverNow + performance.now() - latest.at)
      setTrackTitle(current.track.title)
      setTrackIndex(current.trackIndex)
      if (latest.update.music.status !== 'playing' || blocked.current) { element.pause(); return }
      if (source !== current.track.id) {
        source = current.track.id
        element.src = `${import.meta.env.BASE_URL}music/${source}.mp3`
        element.load()
      }
      if (element.readyState >= 1 && Math.abs(element.currentTime - current.position) > .8) {
        element.currentTime = Math.min(current.position, Math.max(0, element.duration - .05))
      }
      if (element.paused && !playing) {
        const task = element.play()
        playing = task
        void task.catch(failure => {
          if (!active || failure.name === 'AbortError') return
          blocked.current = true
          setAudioError(failure.name === 'NotAllowedError' ? 'Your browser needs a click to enable sound.' : 'The music could not load. Try enabling sound again.')
        }).finally(() => { if (playing === task) playing = null })
      }
    }
    synchronize.current = sync
    function accept(state: MusicUpdate, latency = 0) {
      if (!active || state.roomCode !== roomCode) return
      const old = receipt.current?.update
      if (old && (old.music.revision > state.music.revision || (old.music.revision === state.music.revision && old.serverNow > state.serverNow))) return
      receipt.current = { update: state, at: performance.now() - latency }
      setUpdate(state)
      sync()
    }
    receive.current = accept
    function requestSync() {
      if (!connected.current || !socket.connected || syncing) return
      syncing = true
      const epoch = generation.current
      const sent = performance.now()
      socket.timeout(5000).emit('music:sync', { roomCode }, (failure, result) => {
        syncing = false
        if (!active || epoch !== generation.current || failure || !result.success) return
        accept(result.state, (performance.now() - sent) / 2)
      })
    }
    refresh.current = requestSync
    function disconnect() {
      generation.current++
      connected.current = false
      busy.current = false
      receipt.current = null
      setPending(false)
      setUpdate(null)
      element.pause()
    }
    function failed() {
      if (!active) return
      blocked.current = true
      setAudioError('The music could not load. Try enabling sound again.')
    }
    function visible() { if (!document.hidden) { requestSync(); sync() } }
    socket.on('music:state', accept)
    socket.on('disconnect', disconnect)
    element.addEventListener('loadedmetadata', sync)
    element.addEventListener('canplay', sync)
    element.addEventListener('ended', sync)
    element.addEventListener('error', failed)
    document.addEventListener('visibilitychange', visible)
    const tick = window.setInterval(sync, 1000)
    const poll = window.setInterval(requestSync, 15_000)
    return () => {
      active = false
      generation.current++
      socket.off('music:state', accept)
      socket.off('disconnect', disconnect)
      document.removeEventListener('visibilitychange', visible)
      element.removeEventListener('loadedmetadata', sync)
      element.removeEventListener('canplay', sync)
      element.removeEventListener('ended', sync)
      element.removeEventListener('error', failed)
      clearInterval(tick)
      clearInterval(poll)
      element.pause()
      element.removeAttribute('src')
      element.load()
      receipt.current = null
      audio.current = null
    }
  }, [roomCode])

  useEffect(() => {
    connected.current = joined
    if (joined) refresh.current()
    synchronize.current()
  }, [joined])

  function command(command: MusicCommand) {
    if (!joined || !socket.connected || busy.current) return
    if (command.action === 'play') enableSound()
    busy.current = true
    setPending(true)
    setError('')
    const epoch = generation.current
    socket.timeout(5000).emit('music:command', { roomCode, command }, (failure, result) => {
      if (epoch !== generation.current) return
      busy.current = false
      setPending(false)
      if (failure) { setError('The change was not confirmed. Check the room radio before trying again.'); refresh.current(); return }
      if (!result.success) { setError('The radio could not update. Rejoin the room and try again.'); return }
      receive.current(result.state)
    })
  }
  function enableSound() {
    blocked.current = false
    setAudioError('')
    if (audio.current?.error) audio.current.load()
    synchronize.current()
    refresh.current()
  }
  function changeVolume(value: number) {
    volumeRef.current = value
    setVolume(value)
    if (audio.current) audio.current.volume = value
    try { localStorage.setItem('cove:music-volume', String(value)) } catch { /* Optional preference. */ }
  }
  return {
    state: update?.music, trackTitle, trackIndex, volume, pending, error, audioError,
    station: musicStations.find(station => station.id === update?.music.stationId),
    command, enableSound, changeVolume,
  }
}

export type RoomMusic = ReturnType<typeof useRoomMusic>
