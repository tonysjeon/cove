import { useTheme } from '../theme'

export default function StudyWindow() {
  const { theme, toggle } = useTheme()
  const label = theme === 'light' ? 'Switch to night mode' : 'Switch to light mode'
  return <button className="study-window" type="button" onClick={toggle} aria-label={label}>
    <svg viewBox="0 0 180 250" fill="none" aria-hidden="true">
      <path d="M25 183V83a65 65 0 0 1 130 0v100Z" fill="var(--room-sky)" stroke="var(--room-wood)" strokeWidth="8" />
      <g className="window-day"><circle cx="119" cy="76" r="19" fill="var(--accent)" /><path d="M29 153q35-32 65-4t57-5v35H29Z" fill="var(--room-leaf)" opacity=".25" /></g>
      <g className="window-night" fill="var(--eye-white)"><path d="M119 55a22 22 0 1 0 16 35 24 24 0 0 1-16-35Z" /><circle cx="58" cy="83" r="2" /><circle cx="117" cy="134" r="1.5" /><circle cx="68" cy="43" r="1.5" /></g>
      <path d="M90 22v158M28 112h125" stroke="var(--room-wood)" strokeWidth="5" />
      <rect x="14" y="182" width="152" height="10" rx="4" fill="var(--room-wood)" />
    </svg>
  </button>
}
