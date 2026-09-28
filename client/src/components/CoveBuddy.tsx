import { useEffect, useRef } from 'react'

/** A quiet pair of eyes that follows the pointer without leaving its bounds. */
export default function CoveBuddy({ className = '' }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const pupilsRef = useRef<SVGGElement>(null)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let pointer = { x: 0, y: 0 }

    const reset = () => {
      cancelAnimationFrame(frame)
      frame = 0
      pupilsRef.current?.removeAttribute('transform')
    }
    const followPointer = (event: PointerEvent) => {
      if (reducedMotion.matches || event.pointerType === 'touch') return
      pointer = { x: event.clientX, y: event.clientY }
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const matrix = svgRef.current?.getScreenCTM()
        if (!matrix) return
        const point = new DOMPoint(pointer.x, pointer.y).matrixTransform(matrix.inverse())
        const dx = point.x - 50
        const dy = point.y - 42
        const distance = Math.max(80, Math.hypot(dx, dy))
        pupilsRef.current?.setAttribute('transform', `translate(${dx / distance * 4} ${dy / distance * 5})`)
      })
    }

    window.addEventListener('pointermove', followPointer, { passive: true })
    document.documentElement.addEventListener('pointerleave', reset)
    window.addEventListener('blur', reset)
    reducedMotion.addEventListener('change', reset)
    return () => {
      reset()
      window.removeEventListener('pointermove', followPointer)
      document.documentElement.removeEventListener('pointerleave', reset)
      window.removeEventListener('blur', reset)
      reducedMotion.removeEventListener('change', reset)
    }
  }, [])

  return (
    <svg ref={svgRef} className={`cove-buddy ${className}`} viewBox="0 0 100 84" fill="none" aria-hidden="true">
      <g className="buddy-eyes">
        <ellipse cx="34" cy="42" rx="12" ry="14" fill="var(--eye-white)" />
        <ellipse cx="66" cy="42" rx="12" ry="14" fill="var(--eye-white)" />
        <g ref={pupilsRef} className="buddy-pupils" fill="var(--pupil)">
          <circle cx="34" cy="42" r="6" />
          <circle cx="66" cy="42" r="6" />
        </g>
      </g>
    </svg>
  )
}
