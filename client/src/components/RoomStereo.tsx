import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { musicStations, type StationId } from '../../../server/src/music/catalog'
import type { RoomMusic } from '../music/useRoomMusic'

function StationSketch({ station }: { station: StationId }) {
  return <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {station === 'cafe' ? <>
      <path d="M9 17h20l-2 11c-1 5-14 5-16 0L9 17Z" fill="var(--soft)" />
      <path d="M29 19c9-2 9 9-1 8M7 33c8 2 20 2 26-1M16 12c-4-4 3-4 0-8m7 8c-4-4 3-4 0-8" />
    </> : station === 'rain' ? <>
      <path d="M7 21c-6-7 2-13 8-10 2-9 16-7 16 2 8-1 9 10 1 10H10" fill="var(--soft)" />
      <path d="m13 27-2 5m10-4-2 5m10-6-2 5" />
    </> : <>
      <circle cx="21" cy="19" r="8" fill="var(--soft)" />
      <path d="m21 4 1 3m10 2-2 3m7 7-3 1m-3 10-3-3M8 9l3 3M4 20h4m1 10 3-3M6 35c8-4 19-4 28-1" />
    </>}
  </svg>
}

export default function RoomStereo({ music }: { music: RoomMusic }) {
  const [open, setOpen] = useState(false)
  const [moodsOpen, setMoodsOpen] = useState(false)
  const [cassetteHoverSuppressed, setCassetteHoverSuppressed] = useState(false)
  const cassette = useRef<HTMLButtonElement>(null)
  const moodCancel = useRef<HTMLButtonElement>(null)
  const restoreCassetteFocus = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const playing = music.state?.status === 'playing'
  useLayoutEffect(() => {
    if (moodsOpen) moodCancel.current?.focus({ preventScroll: true })
    else if (restoreCassetteFocus.current) {
      cassette.current?.focus({ preventScroll: true })
      restoreCassetteFocus.current = false
    }
  }, [moodsOpen])
  useLayoutEffect(() => {
    if (!open || !panel.current) return
    const element = panel.current
    function position() {
      const anchor = trigger.current?.getBoundingClientRect()
      if (!anchor) return
      const width = element.offsetWidth
      const height = element.offsetHeight
      const narrow = window.innerWidth <= 560
      const left = narrow ? (window.innerWidth - width) / 2 : anchor.right + 12
      const top = narrow ? window.innerHeight - height - 24 : anchor.bottom - height
      element.style.left = `${Math.max(16, Math.min(left, window.innerWidth - width - 16))}px`
      element.style.top = `${Math.max(16, Math.min(top, window.innerHeight - height - 16))}px`
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(element)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])
  useEffect(() => {
    if (!open) { setMoodsOpen(false); return }
    panel.current?.focus({ preventScroll: true })
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  function close() { setOpen(false); trigger.current?.focus() }
  function closeMoods() { restoreCassetteFocus.current = true; setCassetteHoverSuppressed(true); setMoodsOpen(false) }
  return <div className="study-stereo" ref={root} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); if (moodsOpen) closeMoods(); else close() }
  }} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button className={`stereo-object${playing ? ' is-playing' : ''}`} ref={trigger} type="button" aria-label={playing ? `Room radio, playing ${music.station?.name || 'music'}` : 'Room radio'} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <svg className="radio-illustration" viewBox="0 0 190 125" fill="none" aria-hidden="true">
        {playing && <g className="radio-sound-waves" stroke="var(--radio-shell)" strokeWidth="2" strokeLinecap="round">
          <g className="radio-sound-left">
            <path d="M2 57q-7 13 0 26" />
            <path d="M2 57q-7 13 0 26" />
            <path d="M2 57q-7 13 0 26" />
          </g>
          <g className="radio-sound-right">
            <path d="M188 57q7 13 0 26" />
            <path d="M188 57q7 13 0 26" />
            <path d="M188 57q7 13 0 26" />
          </g>
        </g>}
        <path d="m133 42-34-24" stroke="var(--radio-detail)" strokeWidth="3" strokeLinecap="round" />
        <path d="M37 47V30c0-15 8-22 23-22h70c15 0 23 7 23 22v17" stroke="var(--radio-shell)" strokeWidth="7" strokeLinecap="round" />
        <path d="M31 110v9m128-9v9" stroke="var(--radio-detail)" strokeWidth="7" strokeLinecap="round" />
        <path d="M57 40c2-15 74-15 76 0" fill="var(--radio-face)" stroke="var(--radio-detail)" strokeWidth="1.3" />
        <path d="M91 33h8" stroke="var(--radio-shell)" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="6" y="40" width="178" height="76" rx="28" fill="var(--radio-shell)" />
        <rect x="12" y="46" width="166" height="64" rx="23" fill="var(--radio-face)" />
        <g fill="var(--radio-detail)">
          <circle cx="35" cy="80" r="21" />
          <circle cx="155" cy="80" r="21" />
        </g>
        <g stroke="var(--radio-face)" strokeWidth="1.2" strokeDasharray="1 3" strokeLinecap="round">
          <circle cx="35" cy="80" r="16" />
          <circle cx="155" cy="80" r="16" />
          <circle cx="35" cy="80" r="10" />
          <circle cx="155" cy="80" r="10" />
        </g>
        <g fill="var(--radio-detail)">
          <rect x="73" y="38" width="9" height="5" rx="1.5" />
          <rect x="84" y="38" width="9" height="5" rx="1.5" />
          <rect x="95" y="38" width="9" height="5" rx="1.5" />
          <rect x="106" y="38" width="9" height="5" rx="1.5" />
        </g>
        <rect x="73" y="51" width="44" height="17" rx="5" fill="var(--radio-detail)" />
        <rect x="77" y="54" width="36" height="11" rx="2" fill="var(--paper)" />
        <path d="M82 61v-3m5 3v-5m5 5v-2m5 2v-4" stroke="var(--radio-shell)" strokeWidth="2" strokeLinecap="round" />
        <path d="m104 57 4 2.5-4 2.5z" fill="var(--radio-shell)" />
        <circle cx="64" cy="59" r="4" fill="var(--radio-detail)" />
        <path d="M64 57v2" stroke="var(--paper)" strokeWidth="1" strokeLinecap="round" />
        <circle cx="126" cy="59" r="3" fill={playing ? 'var(--online)' : 'var(--radio-detail)'} />
        <g className="radio-cassette-door">
          <rect x="61" y="73" width="68" height="34" rx="5" fill="var(--radio-shell)" stroke="var(--radio-detail)" strokeWidth="1.2" />
          <rect x="69" y="79" width="52" height="20" rx="3" fill="var(--paper)" />
          <rect x="74" y="83" width="42" height="12" rx="6" fill="var(--radio-detail)" />
          <circle cx="81" cy="89" r="3.5" fill="var(--paper)" />
          <circle cx="109" cy="89" r="3.5" fill="var(--paper)" />
          <path d="M90 87h10v4H90z" stroke="var(--radio-face)" strokeWidth="1" />
          <path d="M81 87v4m-2-2h4m26-2v4m-2-2h4" stroke="var(--radio-detail)" strokeWidth="1" />
          <path d="M83 103h24" stroke="var(--radio-detail)" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
      <svg className="radio-nightstand" viewBox="0 0 190 134" preserveAspectRatio="none" fill="none" aria-hidden="true">
        <path d="m22 9-7 99M168 9l7 99" stroke="var(--room-wood)" strokeWidth="8" strokeLinecap="round" />
        <rect width="190" height="10" rx="4" fill="var(--room-wood)" />
      </svg>
    </button>
    {!open && playing && music.audioError && <button className="radio-enable-sound button-quiet" type="button" onClick={music.enableSound}>Enable sound</button>}
    {open && <div className="stereo-panel" ref={panel} id={id} role="dialog" aria-label="Room radio" tabIndex={-1}>
      <header className="radio-heading">
        <button className="stereo-close button-quiet" type="button" onClick={close} aria-label="Close radio"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg></button>
      </header>
      <div className="radio-mood-slot" onPointerEnter={() => setCassetteHoverSuppressed(false)} onPointerLeave={() => setCassetteHoverSuppressed(false)}>
      <button className={`radio-tape${playing ? ' is-playing' : ''}${moodsOpen ? ' is-hidden' : ''}${cassetteHoverSuppressed ? ' is-hover-suppressed' : ''}`} inert={moodsOpen} ref={cassette} type="button" aria-label={`Change mood, ${music.station?.name || 'room music'}`} aria-expanded={moodsOpen} aria-controls={`${id}-moods`} onClick={() => setMoodsOpen(true)}>
        <span className="radio-tape-label">
          <svg className="radio-tape-music" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 17V6l11-3v11M9 10l11-3" /><ellipse cx="6" cy="18" rx="3" ry="2.5" /><ellipse cx="17" cy="15" rx="3" ry="2.5" /></svg>
          <span className="radio-now">{music.trackTitle || 'Tuning in…'}<span>{music.trackTitle ? 'TAD · ' : ''}{!music.state ? 'Connecting' : playing ? 'Now playing' : 'Paused'}</span></span>
        </span>
        <span className="radio-tape-window" aria-hidden="true"><i /><span /><i /></span>
        <span className="radio-tape-note" aria-hidden="true">{music.station?.name || 'cove mixtapes'}</span>
      </button>
      <div className={`radio-mood-picker${moodsOpen ? '' : ' is-hidden'}`} id={`${id}-moods`} inert={!moodsOpen}>
      <div className="radio-mood-heading"><span>Find your mood</span><button className="button-quiet" ref={moodCancel} type="button" onClick={closeMoods}>Cancel</button></div>
      <fieldset className="radio-stations" disabled={!music.state || music.pending}>
        <legend className="sr-only">Find your mood</legend>
        {musicStations.map(station => <label key={station.id} title={station.description}>
          <input type="radio" name={`${id}-station`} value={station.id} checked={music.state?.stationId === station.id} onChange={() => { music.command({ action: 'station', stationId: station.id }); closeMoods() }} onClick={() => { if (music.state?.stationId === station.id) closeMoods() }} />
          <span className="radio-station-option">
            <StationSketch station={station.id} />
            <span className="radio-station-name">{station.name}</span>
            <span className="radio-station-check" aria-hidden="true" />
          </span>
        </label>)}
      </fieldset>
      </div>
      </div>
      <div className="radio-room-controls">
        <button className="radio-previous" type="button" disabled={!music.state || music.pending || music.trackIndex === 0} onClick={() => music.command({ action: 'previous' })} aria-label="Previous track for everyone" title="Previous track">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="m16 4-9 6 9 6zM4 4h2v12H4z" /></svg>
        </button>
        <button className="radio-play" type="button" disabled={!music.state || music.pending} onClick={() => music.command({ action: playing ? 'pause' : 'play' })} aria-label={playing ? 'Pause for everyone' : 'Play for everyone'} title={playing ? 'Pause' : 'Play'}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">{playing ? <path d="M5 4h3v12H5zm7 0h3v12h-3z" /> : <path d="m6 3 11 7-11 7z" />}</svg>
        </button>
        <button className="radio-next" type="button" disabled={!music.state || music.pending} onClick={() => music.command({ action: 'next' })} aria-label="Next track for everyone" title="Next track">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="m4 4 9 6-9 6zm10 0h2v12h-2z" /></svg>
        </button>
      </div>
      <div className="radio-personal">
        {playing && music.audioError && <button type="button" onClick={music.enableSound}>Enable sound</button>}
        <label className="radio-volume">
          <span>Your volume</span>
          <span className="radio-volume-control">
            <svg viewBox="0 0 15 24" fill="currentColor" aria-hidden="true"><path d="M3 9h4l6-5v16l-6-5H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z" /></svg>
            <input type="range" min="0" max="1" step=".01" value={music.volume} style={{ '--volume-fill': `calc(9px + (100% - 18px) * ${music.volume})` } as CSSProperties} aria-label="Your volume" aria-valuetext={`${Math.round(music.volume * 100)}%${music.volume === 0 ? ', muted' : ''}`} onChange={event => music.changeVolume(Number(event.target.value))} />
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 9h4l6-5v16l-6-5H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z" fill="currentColor" /><path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </span>
        </label>
      </div>
      {(music.error || music.audioError) && <p className="radio-error" role="alert">{music.error || music.audioError}</p>}
      <p className="radio-credit">Music by <a href="https://opengameart.org/content/lofi-compilation" target="_blank" rel="noreferrer">TAD</a> · <a href={`${import.meta.env.BASE_URL}music/CREDITS.md`} target="_blank" rel="noreferrer">CC0 & credits</a></p>
    </div>}
  </div>
}
