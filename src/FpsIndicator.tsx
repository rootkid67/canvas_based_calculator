import { useEffect, useState } from 'react'

const SAMPLE_COUNT = 32

export default function FpsIndicator() {
  const [fps, setFps] = useState<number | null>(null)
  const [history, setHistory] = useState<number[]>([])

  useEffect(() => {
    let animationFrame = 0
    let sampleStart = 0
    let frameCount = 0

    const measure = (timestamp: number) => {
      if (sampleStart === 0) sampleStart = timestamp
      frameCount++

      const elapsed = timestamp - sampleStart
      if (elapsed >= 500) {
        const currentFps = Math.round((frameCount * 1000) / elapsed)
        setFps(currentFps)
        setHistory((previous) => [...previous.slice(-(SAMPLE_COUNT - 1)), currentFps])
        frameCount = 0
        sampleStart = timestamp
      }

      animationFrame = window.requestAnimationFrame(measure)
    }

    animationFrame = window.requestAnimationFrame(measure)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [])

  const color = fps === null || fps >= 60 ? '#55dd86' : '#f0b45b'
  const points = history.map((value, index) => {
    const x = history.length > 1 ? (index / (history.length - 1)) * 100 : 100
    const y = 26 - (Math.min(value, 120) / 120) * 22
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="fps-indicator" title="Live animation frame rate; target is 60 FPS or higher" aria-label={`Current frame rate: ${fps ?? 'measuring'} FPS`}>
      <div className="fps-readout"><span className="fps-label">FPS</span><strong style={{ color }}>{fps ?? '—'}</strong></div>
      <svg className="fps-graph" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label="Recent frame rate graph">
        <line x1="0" y1="15" x2="100" y2="15" stroke="#555" strokeDasharray="2 3" />
        {points && <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </svg>
      <span className="fps-target">60</span>
    </div>
  )
}
