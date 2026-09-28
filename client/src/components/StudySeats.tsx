import type { ConnectedUser } from '../../../server/src/types/rooms'

function PlayerFace() {
  return <g className="player-face">
    <circle cx="79" cy="48" r="24" fill="var(--player-face)" />
    <g className="player-eyes">
      <ellipse cx="71" cy="48" rx="5" ry="6" fill="var(--eye-white)" /><ellipse cx="86" cy="48" rx="5" ry="6" fill="var(--eye-white)" />
      <circle cx="72" cy="49" r="2.5" fill="var(--pupil)" /><circle cx="87" cy="49" r="2.5" fill="var(--pupil)" />
    </g>
  </g>
}

function avatarVariant(name: string) {
  return Array.from(name).reduce((hash, char) => (hash * 31 + char.codePointAt(0)!) >>> 0, 0) % 3
}

function Armchair({ occupied }: { occupied: boolean }) {
  return <svg className="study-armchair" viewBox="0 0 220 160" fill="none" aria-hidden="true">
    <g transform="translate(11 0) scale(.9 1)">
    <ellipse cx="110" cy="150" rx="97" ry="8" fill="var(--room-shadow)" />
    <path d="m38 130-4 19m148-19 4 19" stroke="var(--room-wood)" strokeWidth="8" strokeLinecap="round" />
    <rect x="26" y="12" width="168" height="112" rx="32" fill="var(--seat-back)" />
    <rect x="38" y="82" width="144" height="50" rx="18" fill="var(--seat-cushion)" />
    <path d="M46 111h128" stroke="var(--seat-back)" strokeWidth="2" />
    <rect x="12" y="66" width="32" height="70" rx="15" fill="var(--seat-arm)" />
    <rect x="176" y="66" width="32" height="70" rx="15" fill="var(--seat-arm)" />
    </g>
    {occupied && <PlayerFace />}
  </svg>
}

export default function StudySeats({ members, ownSocketId, joinedName }: { members: ConnectedUser[]; ownSocketId?: string; joinedName: string }) {
  const openSeats = Math.max(0, 3 - members.length)
  return <aside className="study-seating" aria-label="People in the room">
    <ul className="study-seats" aria-label="Active users" aria-live="polite" aria-relevant="additions removals">
      {members.map(member => <li className="study-seat" data-avatar={avatarVariant(member.displayName)} key={member.socketId}>
        <Armchair occupied />
        <div className="study-guest" title={member.displayName}>
          <span className="member-name">{member.displayName}{member.socketId === ownSocketId && <small>you</small>}</span>
        </div>
      </li>)}
      {Array.from({ length: openSeats }, (_, index) => <li className="study-seat is-empty" key={`open:${index}`} aria-hidden="true">
        <Armchair occupied={false} /><span className="open-seat-label">Open seat</span>
      </li>)}
    </ul>
    <p className="sr-only" role="status">Joined as {joinedName}</p>
  </aside>
}
