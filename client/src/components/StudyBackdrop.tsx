import StudyWindow from './StudyWindow'
export default function StudyBackdrop() {
  return <div className="study-backdrop">
    <StudyWindow />
    <svg className="study-lamp" viewBox="0 0 180 350" fill="none" aria-hidden="true">
      <path d="m68 80-53 219h150L113 80" fill="var(--room-lamp-glow)" />
      <path d="M91 70v244" stroke="var(--room-wood)" strokeWidth="6" />
      <ellipse cx="91" cy="320" rx="39" ry="7" fill="var(--room-wood)" />
      <path d="M58 24h66l26 73H32Z" fill="var(--room-lampshade)" />
      <path d="m67 29-12 61m31-61-3 61m21-61 10 61" stroke="var(--paper)" strokeWidth="2" opacity=".4" />
      <path d="M119 100v26" stroke="var(--room-wood)" strokeWidth="2" /><circle cx="119" cy="129" r="3" fill="var(--room-wood)" />
    </svg>
  </div>
}
