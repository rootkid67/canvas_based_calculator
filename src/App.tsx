import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import FpsIndicator from './FpsIndicator'
import { clientToCanvasPoint } from './canvasCoordinates'
import './App.css'

type Point = { x: number; y: number }
type CanvasStroke = { points: Point[]; width: number; color: string; style: 'pen' | 'calligraphy' | 'eraser' }
type CalculationHistoryEntry = { expression: string; answer: string; createdAt: number }
type Theme = 'black' | 'white' | 'pink' | 'blue' | 'green' | 'yellow'
type CanvasTemplate = 'solid' | 'grid' | 'dotted' | 'lines'

const CALCULATION_HISTORY_KEY = 'calcink.calculation-history'
const MAX_CALCULATION_HISTORY = 10
const MAX_UNDO_SNAPSHOTS = 20
const MAX_CANVAS_STROKES = 500
const MAX_CANVAS_POINTS = 20_000
const LIVE_RECOGNITION_DEBOUNCE_MS = 650
const INK_COLORS = ['#e0e0e0', '#ff6b6b', '#ffae42', '#ffe45c', '#62df8b', '#42cfff', '#7188ff', '#d77bff']
const THEMES: { id: Theme; label: string; color: string }[] = [
  { id: 'black', label: 'Black', color: '#171717' },
  { id: 'white', label: 'White', color: '#f4f4f4' },
  { id: 'pink', label: 'Light pink', color: '#f8dce8' },
  { id: 'blue', label: 'Light blue', color: '#dcecf8' },
  { id: 'green', label: 'Light green', color: '#deefdf' },
  { id: 'yellow', label: 'Light yellow', color: '#f7efcf' },
]
const CANVAS_TEMPLATES: { id: CanvasTemplate; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'grid', label: 'Square grid' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'lines', label: 'Lines' },
]

function loadTheme(): Theme {
  try {
    const savedTheme = localStorage.getItem('calcink.theme')
    return THEMES.some((option) => option.id === savedTheme) ? savedTheme as Theme : 'black'
  } catch {
    return 'black'
  }
}

function loadCanvasTemplate(): CanvasTemplate {
  try {
    const savedTemplate = localStorage.getItem('calcink.canvas-template')
    return CANVAS_TEMPLATES.some((option) => option.id === savedTemplate) ? savedTemplate as CanvasTemplate : 'dotted'
  } catch {
    return 'dotted'
  }
}

function loadCalculationHistory(): CalculationHistoryEntry[] {
  try {
    const stored = localStorage.getItem(CALCULATION_HISTORY_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is CalculationHistoryEntry =>
        entry !== null && typeof entry === 'object'
        && typeof entry.expression === 'string'
        && typeof entry.answer === 'string'
        && typeof entry.createdAt === 'number')
      .map((entry) => ({ ...entry, expression: entry.expression.split('=')[0].trim() }))
      .slice(0, MAX_CALCULATION_HISTORY)
  } catch {
    return []
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const redrawFrame = useRef<number | undefined>(undefined)
  const strokes = useRef<CanvasStroke[]>([])
  const currentStroke = useRef<CanvasStroke | null>(null)
  const history = useRef<CanvasStroke[][]>([])
  const historyIndex = useRef(-1)
  const recognitionTimer = useRef<number | undefined>(undefined)
  const recognitionBusyRef = useRef(false)
  const recognitionPendingRef = useRef(false)
  const canvasRevisionRef = useRef(0)
  const lastSolvedExpressionRef = useRef('')
  const [tool, setTool] = useState<'pen' | 'calligraphy' | 'eraser' | 'select'>('pen')
  const [eraserMode, setEraserMode] = useState<'partial' | 'stroke'>('partial')
  const [inkColor, setInkColor] = useState(INK_COLORS[0])
  const [showColorPalette, setShowColorPalette] = useState(false)
  const [penWidth, setPenWidth] = useState(3)
  const [eraserWidth, setEraserWidth] = useState(22)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [recognitionBusy, setRecognitionBusy] = useState(false)
  const [calculationAnswer, setCalculationAnswer] = useState('')
  const [calculationHistory, setCalculationHistory] = useState<CalculationHistoryEntry[]>(loadCalculationHistory)
  const [showCalculationHistory, setShowCalculationHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [dynamicCanvasResolution, setDynamicCanvasResolution] = useState(true)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [canvasTemplate, setCanvasTemplate] = useState<CanvasTemplate>(loadCanvasTemplate)
  const [answerPosition, setAnswerPosition] = useState({ left: 0, top: 0 })
  const [answerFontSize, setAnswerFontSize] = useState(48)
  const [recognitionMessage, setRecognitionMessage] = useState('Write an expression on the canvas. Recognition will appear here.')

  useEffect(() => {
    try {
      localStorage.setItem(CALCULATION_HISTORY_KEY, JSON.stringify(calculationHistory))
    } catch {
      // Keep the current session usable if browser storage is unavailable.
    }
  }, [calculationHistory])

  useEffect(() => {
    try {
      localStorage.setItem('calcink.theme', theme)
    } catch {
      // Theme changes still apply for the current session when storage is unavailable.
    }
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem('calcink.canvas-template', canvasTemplate)
    } catch {
      // Template changes still apply for the current session when storage is unavailable.
    }
  }, [canvasTemplate])

  const updateHistoryControls = useCallback(() => {
    setCanUndo(historyIndex.current > 0)
    setCanRedo(historyIndex.current < history.current.length - 1)
  }, [])

  const saveHistory = () => {
    history.current = history.current.slice(0, historyIndex.current + 1)
    history.current.push(strokes.current.map((stroke) => ({ ...stroke, points: [...stroke.points] })))
    if (history.current.length > MAX_UNDO_SNAPSHOTS) {
      history.current.splice(0, history.current.length - MAX_UNDO_SNAPSHOTS)
    }
    historyIndex.current = history.current.length - 1
    updateHistoryControls()
  }

  const enforceCanvasMemoryLimits = () => {
    let totalPoints = strokes.current.reduce((total, stroke) => total + stroke.points.length, 0)
    while (strokes.current.length > MAX_CANVAS_STROKES) {
      totalPoints -= strokes.current.shift()!.points.length
    }
    while (totalPoints > MAX_CANVAS_POINTS && strokes.current.length > 1) {
      totalPoints -= strokes.current.shift()!.points.length
    }

    // A single exceptionally long stroke can exceed the full canvas point
    // budget. Downsample it while preserving its endpoints and overall path.
    const onlyStroke = strokes.current[0]
    while (strokes.current.length === 1 && onlyStroke.points.length > MAX_CANVAS_POINTS) {
      const lastIndex = onlyStroke.points.length - 1
      onlyStroke.points = onlyStroke.points.filter((_, index) => index % 2 === 0 || index === lastIndex)
    }
  }

  const paintStroke = useCallback((context: CanvasRenderingContext2D, stroke: CanvasStroke) => {
    if (!stroke.points.length) return
    if (stroke.style === 'calligraphy') {
      const nibLength = Math.max(2, stroke.width * 1.7)
      const nibThickness = Math.max(1, stroke.width * 0.32)
      const spacing = Math.max(1, nibLength / 4)
      const angle = -Math.PI / 4
      context.fillStyle = stroke.color
      const stamp = (point: Point) => {
        context.save()
        context.translate(point.x, point.y)
        context.rotate(angle)
        context.beginPath()
        context.ellipse(0, 0, nibLength / 2, nibThickness / 2, 0, 0, Math.PI * 2)
        context.fill()
        context.restore()
      }
      stamp(stroke.points[0])
      for (let index = 1; index < stroke.points.length; index++) {
        const start = stroke.points[index - 1]
        const end = stroke.points[index]
        const distance = Math.hypot(end.x - start.x, end.y - start.y)
        const steps = Math.max(1, Math.ceil(distance / spacing))
        for (let step = 1; step <= steps; step++) {
          const progress = step / steps
          stamp({ x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress })
        }
      }
      return
    }
      context.beginPath()
      context.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (let index = 1; index < stroke.points.length; index++) {
        context.lineTo(stroke.points[index].x, stroke.points[index].y)
      }
      if (stroke.points.length === 1) context.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1)
      
      context.lineWidth = stroke.width
      context.lineCap = 'round'
      context.lineJoin = 'round'

      if (stroke.style === 'eraser') {
        context.globalCompositeOperation = 'destination-out'
        context.strokeStyle = 'rgba(0,0,0,1)' // any color erases
      } else {
        context.globalCompositeOperation = 'source-over'
        context.strokeStyle = stroke.color
      }

      context.stroke()
      context.globalCompositeOperation = 'source-over' // reset
  }, [])

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    for (const stroke of strokes.current) paintStroke(context, stroke)
    if (currentStroke.current && currentStroke.current.color !== 'erase-stroke') paintStroke(context, currentStroke.current)
  }, [paintStroke])

  const prepareCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    // Increase backing resolution with the active drawing width, while bounding
    // total pixels to keep large canvases within a predictable fill-rate budget.
    const maxCanvasPixels = 12_000_000
    const brushSize = tool === 'eraser' ? eraserWidth : penWidth
    const sizeProgress = Math.max(0, Math.min(1, (brushSize - 1) / 11))
    // Canvas coordinates remain in CSS pixels; density increases linearly
    // from 2x to 10x with brush width, then accounts for the display DPR.
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1)
    const requestedRatio = devicePixelRatio * (dynamicCanvasResolution ? 2 + sizeProgress * 8 : 2)
    const pixelBudgetRatio = Math.sqrt(maxCanvasPixels / Math.max(1, rect.width * rect.height))
    const ratio = Math.min(requestedRatio, pixelBudgetRatio)
    canvas.width = Math.round(rect.width * ratio)
    canvas.height = Math.round(rect.height * ratio)
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    if (history.current.length === 0) {
      history.current = [strokes.current.map((stroke) => ({ ...stroke, points: [...stroke.points] }))]
      historyIndex.current = 0
      updateHistoryControls()
    }
    redrawCanvas()
  }, [dynamicCanvasResolution, eraserWidth, penWidth, redrawCanvas, tool, updateHistoryControls])

  useEffect(() => {
    prepareCanvas()
    window.addEventListener('resize', prepareCanvas)
    // A window moved between monitors can change DPR without a normal layout
    // resize. Re-arm the resolution query after each DPR change.
    let resolutionQuery: MediaQueryList | undefined
    const watchResolution = () => {
      resolutionQuery?.removeEventListener('change', handleResolutionChange)
      resolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      resolutionQuery.addEventListener('change', handleResolutionChange)
    }
    const handleResolutionChange = () => {
      prepareCanvas()
      watchResolution()
    }
    watchResolution()
    return () => {
      window.removeEventListener('resize', prepareCanvas)
      resolutionQuery?.removeEventListener('change', handleResolutionChange)
    }
  }, [prepareCanvas])

  useEffect(() => () => {
    if (recognitionTimer.current !== undefined) window.clearTimeout(recognitionTimer.current)
    if (redrawFrame.current !== undefined) window.cancelAnimationFrame(redrawFrame.current)
  }, [])

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return clientToCanvasPoint(event.clientX, event.clientY, rect)
  }

  const triggerHapticFeedback = (duration = 8) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(duration)
    }
  }

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    const isEraserOverride = event.button === 2 || event.button === 5
    const activeTool = isEraserOverride ? 'eraser' : tool
    if (activeTool === 'select') return // Do nothing in select mode

    const canvas = event.currentTarget
    canvas.setPointerCapture(event.pointerId)
    drawing.current = true
    const point = pointFromEvent(event)

    const context = canvas.getContext('2d')
    if (!context) return
    const stroke: CanvasStroke = { 
      points: [point], 
      width: activeTool === 'eraser' ? eraserWidth : penWidth, 
      color: activeTool === 'eraser' ? 'rgba(0,0,0,1)' : inkColor,
      style: activeTool === 'eraser' ? 'eraser' : activeTool 
    }
    currentStroke.current = stroke
    
    if (stroke.style === 'calligraphy') {
      if (redrawFrame.current === undefined) {
        redrawFrame.current = window.requestAnimationFrame(() => {
          redrawFrame.current = undefined
          redrawCanvas()
        })
      }
      return
    }
    
    context.beginPath()
    context.moveTo(point.x, point.y)
    context.strokeStyle = stroke.color
    context.lineWidth = stroke.width
  }

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const isEraserOverride = event.buttons === 2 || event.buttons === 32 // 32 is sometimes stylus eraser
    const activeTool = isEraserOverride ? 'eraser' : tool
    if (activeTool === 'select') return

    const stroke = currentStroke.current
    if (!stroke) return
    const coalescedEvents = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
    const rect = event.currentTarget.getBoundingClientRect()
    const points: Point[] = []
    for (const sample of coalescedEvents) {
      const point = clientToCanvasPoint(sample.clientX, sample.clientY, rect)
      points.push(point)
      stroke.points.push(point)
    }
    if (stroke.points.length > MAX_CANVAS_POINTS) {
      const lastIndex = stroke.points.length - 1
      stroke.points = stroke.points.filter((_, index) => index % 2 === 0 || index === lastIndex)
    }
    
    if (stroke.style === 'calligraphy') {
      if (redrawFrame.current === undefined) {
        redrawFrame.current = window.requestAnimationFrame(() => {
          redrawFrame.current = undefined
          redrawCanvas()
        })
      }
      return
    }
    
    const context = event.currentTarget.getContext('2d')
    if (!context) return
    
    if (stroke.style === 'eraser') {
      context.globalCompositeOperation = 'destination-out'
      context.strokeStyle = 'rgba(0,0,0,1)'
    }
    
    for (const point of points) context.lineTo(point.x, point.y)
    context.stroke()
    
    if (stroke.style === 'eraser') {
      context.globalCompositeOperation = 'source-over'
    }
  }

  const stopDrawing = () => {
    if (!drawing.current) return
    drawing.current = false
    const stroke = currentStroke.current
    currentStroke.current = null

    if (stroke?.style === 'eraser') {
      const distanceToSegment = (point: Point, start: Point, end: Point) => {
        const dx = end.x - start.x
        const dy = end.y - start.y
        const length = dx * dx + dy * dy
        const t = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0
        return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
      }

      if (eraserMode === 'stroke') {
        const hit = (candidate: CanvasStroke) => {
          const segments = candidate.points.length > 1 ? candidate.points.slice(1).map((point, index) => [candidate.points[index], point] as const) : [[candidate.points[0], candidate.points[0]] as const]
          return stroke.points.some((eraserPoint) => segments.some(([start, end]) => distanceToSegment(eraserPoint, start, end) <= stroke.width / 2 + candidate.width / 2))
        }
        strokes.current = strokes.current.filter((candidate) => !hit(candidate))
      } else {
        const newStrokes: CanvasStroke[] = []
        const eraserSegments = stroke.points.length > 1 
          ? stroke.points.slice(1).map((pt, i) => [stroke.points[i], pt] as const)
          : [[stroke.points[0], stroke.points[0]] as const]

        for (const existingStroke of strokes.current) {
          let currentSubStroke: Point[] = []
          
          for (const pt of existingStroke.points) {
            const isHit = eraserSegments.some(([start, end]) => 
              distanceToSegment(pt, start, end) <= (stroke.width / 2) + (existingStroke.width / 2)
            )
            
            if (isHit) {
              if (currentSubStroke.length > 0) {
                newStrokes.push({ ...existingStroke, points: currentSubStroke })
                currentSubStroke = []
              }
            } else {
              currentSubStroke.push(pt)
            }
          }
          if (currentSubStroke.length > 0) {
            newStrokes.push({ ...existingStroke, points: currentSubStroke })
          }
        }
        strokes.current = newStrokes
      }
      redrawCanvas()
    } else if (stroke) {
      strokes.current.push(stroke)
    }
    enforceCanvasMemoryLimits()
    redrawCanvas()
    saveHistory()
    triggerHapticFeedback()
    scheduleLiveRecognition()
  }

  const scheduleLiveRecognition = () => {
    canvasRevisionRef.current += 1
    const revision = canvasRevisionRef.current
    if (recognitionTimer.current !== undefined) window.clearTimeout(recognitionTimer.current)
    if (!strokes.current.some((candidate) => candidate.style !== 'eraser' && candidate.points.length > 0)) {
      setCalculationAnswer('')
      lastSolvedExpressionRef.current = ''
      setRecognitionMessage('Write a math expression on the canvas to recognize it.')
      return
    }
    // Remove the old answer as soon as the ink changes so it cannot be mistaken
    // for the result of the equation currently being edited.
    setCalculationAnswer('')
    setRecognitionMessage('Live recognition will update when you pause drawing…')
    recognitionTimer.current = window.setTimeout(() => {
      recognitionTimer.current = undefined
      void recognizeExpression(revision)
    }, LIVE_RECOGNITION_DEBOUNCE_MS)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (canvas) {
      strokes.current = []
      redrawCanvas()
      saveHistory()
      scheduleLiveRecognition()
    }
  }

  const recognizeExpression = async (revision = canvasRevisionRef.current) => {
    if (recognitionTimer.current !== undefined) {
      window.clearTimeout(recognitionTimer.current)
      recognitionTimer.current = undefined
    }
    if (recognitionBusyRef.current) {
      recognitionPendingRef.current = true
      return
    }
    recognitionBusyRef.current = true
    setRecognitionBusy(true)
    setRecognitionMessage('Loading the local math model and reading your handwriting…')
    try {
      const { recognizeCanvasStrokes } = await import('./recognizer')
      const strokeSnapshot = strokes.current.map((stroke) => ({ ...stroke, points: [...stroke.points] }))
      const result = await recognizeCanvasStrokes(strokeSnapshot)
      // Recognition can take long enough for the user to edit the canvas.
      // Discard results for an older revision; the queued recognition will use
      // the latest strokes once this request finishes.
      if (revision !== canvasRevisionRef.current) return
      const elapsed = (result.processingMs / 1000).toFixed(1)
      const recognizedBaseExpression = result.latex.split('=')[0].trim()
      const sameSolvedExpression = recognizedBaseExpression.replace(/\s/g, '') === lastSolvedExpressionRef.current.replace(/\s/g, '')

      if (result.answer !== undefined) {
        if (!sameSolvedExpression) lastSolvedExpressionRef.current = recognizedBaseExpression
        const entry = { expression: recognizedBaseExpression, answer: result.answer, createdAt: Date.now() }
        setCalculationHistory((previous) => {
          if (previous[0]?.expression === entry.expression && previous[0]?.answer === entry.answer) return previous
          return [entry, ...previous].slice(0, MAX_CALCULATION_HISTORY)
        })
        const canvas = canvasRef.current
        let right = 0
        let top = Infinity
        let bottom = -Infinity
        for (const stroke of strokes.current) {
          if (stroke.style === 'eraser') continue
          for (const point of stroke.points) {
            right = Math.max(right, point.x)
            top = Math.min(top, point.y)
            bottom = Math.max(bottom, point.y)
          }
        }
        if (!sameSolvedExpression && canvas && Number.isFinite(top)) {
          const bounds = canvas.getBoundingClientRect()
          const fontSize = Math.max(48, Math.min((bottom - top) * 1.25, bounds.height * 0.42))
          const answerWidth = result.answer.length * fontSize * 0.62
          const rightPosition = right + 18
          const fitsBesideExpression = rightPosition + answerWidth <= bounds.width - 12
          setAnswerFontSize(fontSize)
          setAnswerPosition({
            left: fitsBesideExpression ? rightPosition : Math.max(12, bounds.width - answerWidth - 12),
            top: fitsBesideExpression
              ? Math.max(12, (top + bottom) / 2 - fontSize * 0.4)
              : Math.min(bottom + 12, bounds.height - fontSize - 12),
          })
        }
        setCalculationAnswer(result.answer)
      } else {
        setCalculationAnswer('')
      }
      setRecognitionMessage(result.answer !== undefined
        ? `Result: ${result.answer} · ${elapsed}s`
        : result.hasEquals
          ? `Could not evaluate that expression · ${elapsed}s`
          : `Finished in ${elapsed}s`)
    } catch (error) {
      setRecognitionMessage(error instanceof Error ? error.message : 'Recognition failed. Please try again.')
    } finally {
      recognitionBusyRef.current = false
      setRecognitionBusy(false)
      if (recognitionPendingRef.current) {
        recognitionPendingRef.current = false
          recognitionTimer.current = window.setTimeout(() => {
            recognitionTimer.current = undefined
          void recognizeExpression(canvasRevisionRef.current)
        }, 250)
      }
    }
  }

  const restoreHistory = (direction: -1 | 1) => {
    if (!canvasRef.current) return
    const nextIndex = historyIndex.current + direction
    if (nextIndex < 0 || nextIndex >= history.current.length) return
    historyIndex.current = nextIndex
    strokes.current = history.current[nextIndex].map((stroke) => ({ ...stroke, points: [...stroke.points] }))
    redrawCanvas()
    updateHistoryControls()
    scheduleLiveRecognition()
  }

  return (
    <main className={`app-shell theme-${theme}`}>
      <header className="topbar">
        <a className="brand" href="#home" aria-label="CalcInk home"><span className="brand-mark">c</span>calc<span>ink</span></a>
        <div className="topbar-status">
          <FpsIndicator />
          <span className={`topbar-activity ${recognitionBusy ? 'is-processing' : 'is-idle'}`} role="status" aria-label={recognitionBusy ? 'Processing' : 'Idle'}>
            <span className="live-dot" />{recognitionBusy ? 'Processing' : 'Idle'}
          </span>
          <button className="history-toggle" onClick={() => setShowCalculationHistory((visible) => !visible)} aria-expanded={showCalculationHistory}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
            History
          </button>
          <div className="settings-control">
            <button className="settings-toggle" onClick={() => setShowSettings((visible) => !visible)} aria-label="Settings" title="Settings" aria-expanded={showSettings}>
              <svg className="settings-gear-icon" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24"><path d="m19.14 12.94.06-.94-.06-.94 2.03-1.58-2-3.46-2.43.98a7.9 7.9 0 0 0-1.63-.95L14.74 3h-4l-.37 3.05a7.9 7.9 0 0 0-1.63.95l-2.43-.98-2 3.46 2.03 1.58-.06.94.06.94-2.03 1.58 2 3.46 2.43-.98c.5.4 1.05.72 1.63.95L10.74 21h4l.37-3.05c.58-.23 1.13-.55 1.63-.95l2.43.98 2-3.46z" transform="translate(-1.7 -1.5) scale(1.14)"/><circle cx="12" cy="12" r="3.1" /></svg>
            </button>
            {showSettings && <div className="settings-popover" role="group" aria-label="Settings">
              <strong>Settings</strong>
              <fieldset className="theme-picker">
                <legend>Themes</legend>
                <div className="theme-options">
                  {THEMES.map((option) => <button key={option.id} type="button" className={`theme-option ${theme === option.id ? 'selected' : ''}`} onClick={() => setTheme(option.id)} aria-label={`${option.label} theme`} aria-pressed={theme === option.id} title={option.label}>
                    <span style={{ backgroundColor: option.color }} />
                    <small>{option.label}</small>
                  </button>)}
                </div>
              </fieldset>
              <fieldset className="theme-picker template-picker">
                <legend>Templates</legend>
                <div className="theme-options">
                  {CANVAS_TEMPLATES.map((option) => <button key={option.id} type="button" className={`theme-option ${canvasTemplate === option.id ? 'selected' : ''}`} onClick={() => setCanvasTemplate(option.id)} aria-label={`${option.label} canvas template`} aria-pressed={canvasTemplate === option.id} title={option.label}>
                    <span className={`template-preview template-${option.id}`} />
                    <small>{option.label}</small>
                  </button>)}
                </div>
              </fieldset>
              <label><span>Dynamic canvas resolution</span><input type="checkbox" checked={dynamicCanvasResolution} onChange={(event) => setDynamicCanvasResolution(event.target.checked)} /></label>
            </div>}
          </div>
        </div>
      </header>

      <section className="workspace">
        <div className="desk">
          <section className="paper-panel" aria-label="Writing canvas">
            <div className={`paper-wrap template-${canvasTemplate}`}>
              {showCalculationHistory && <aside className="calculation-history" aria-label="Calculation history">
                <div className="calculation-history-heading">
                  <div><strong>Recent calculations</strong></div>
                  <nav className="history-actions" aria-label="History actions">
                    <button className="history-clear-all" onClick={() => setCalculationHistory([])} disabled={calculationHistory.length === 0}>Clear all</button>
                    <button className="history-close" onClick={() => setShowCalculationHistory(false)} aria-label="Close calculation history">×</button>
                  </nav>
                </div>
                {calculationHistory.length === 0
                  ? <p className="calculation-history-empty">Solved calculations will appear here.</p>
                  : <ol>{calculationHistory.map((entry, index) => <li key={`${entry.createdAt}-${entry.expression}-${entry.answer}`}>
                    <div className="history-entry-content">
                      <span>{entry.expression}</span><span className="history-equals">=</span><strong>{entry.answer}</strong>
                      <time>{new Date(entry.createdAt).toLocaleString()}</time>
                    </div>
                    <button className="history-delete" onClick={() => setCalculationHistory((previous) => previous.filter((_, entryIndex) => entryIndex !== index))} aria-label={`Delete calculation ${entry.expression} = ${entry.answer}`} title="Delete calculation">
                      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
                    </button>
                  </li>)}</ol>}
              </aside>}
              <canvas 
                ref={canvasRef} 
                className={`writing-canvas ${tool}-cursor`} 
                onPointerDown={startDrawing} 
                onPointerMove={draw} 
                onPointerUp={stopDrawing} 
                onPointerCancel={stopDrawing} 
                onPointerLeave={stopDrawing} 
                onContextMenu={(e) => e.preventDefault()}
                aria-label="Blank drawing canvas" 
              />
              {calculationAnswer && <div className={`canvas-answer${calculationAnswer === 'undefined' ? ' undefined' : ''}`} style={{ left: answerPosition.left, top: answerPosition.top, fontSize: answerFontSize }} aria-label={`Result: ${calculationAnswer}`}>
                {calculationAnswer}
              </div>}
              <span className="visually-hidden" aria-live="polite">{recognitionMessage}</span>
              
              {/* Floating Toolbar */}
              <div className="floating-toolbar">
                <div className="toolbar-section">
                  <button className="floating-tool-btn" onClick={() => restoreHistory(-1)} disabled={!canUndo} title="Undo">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                  </button>
                  <button className="floating-tool-btn" onClick={() => restoreHistory(1)} disabled={!canRedo} title="Redo">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
                  </button>
                </div>
                
                <div className="toolbar-divider" />
                
                <div className="toolbar-section tools">
                  <button className={`floating-tool-btn ${tool === 'select' ? 'active' : ''}`} onClick={() => { setTool('select'); setShowColorPalette(false) }} title="Select (Pan)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
                  </button>
                  <button className={`floating-tool-btn ${tool === 'pen' ? 'active' : ''}`} onClick={() => { setTool('pen'); setShowColorPalette(false) }} title="Pen">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l-6 6v3h3l6-6"/><path d="M11 9l4-4a2.12 2.12 0 0 1 3 3l-4 4"/><path d="M14 14l3 3"/><path d="M16 10l3 3"/></svg>
                  </button>
                  <button className={`floating-tool-btn ${tool === 'calligraphy' ? 'active' : ''}`} onClick={() => { setTool('calligraphy'); setShowColorPalette(false) }} title="Brush">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
                  </button>
                  <div className="eraser-group">
                    <button className={`floating-tool-btn ${tool === 'eraser' ? 'active' : ''}`} onClick={() => { setTool('eraser'); setShowColorPalette(false) }} title="Eraser">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
                    </button>
                    {tool === 'eraser' && (
                      <div className="eraser-flyout">
                        <button className={eraserMode === 'partial' ? 'active' : ''} onClick={() => setEraserMode('partial')}>Partial</button>
                        <button className={eraserMode === 'stroke' ? 'active' : ''} onClick={() => setEraserMode('stroke')}>Stroke</button>
                      </div>
                    )}
                  </div>
                  {(tool === 'pen' || tool === 'calligraphy') && <div className="color-group">
                    <button className="color-current" onClick={() => setShowColorPalette((visible) => !visible)} aria-label={`Choose ${tool === 'calligraphy' ? 'brush' : 'pen'} color`} aria-expanded={showColorPalette} title={`${tool === 'calligraphy' ? 'Brush' : 'Pen'} color: ${inkColor}`}>
                      <span style={{ backgroundColor: inkColor }} />
                    </button>
                    {showColorPalette && <div className="color-flyout" role="group" aria-label={`${tool === 'calligraphy' ? 'Brush' : 'Pen'} color options`}>
                      <div className="color-swatches">
                        {INK_COLORS.map((color) => <button key={color} className={`color-swatch ${inkColor === color ? 'selected' : ''}`} style={{ backgroundColor: color }} onClick={() => { setInkColor(color); setShowColorPalette(false) }} aria-label={`Use ${color}`} aria-pressed={inkColor === color} />)}
                      </div>
                      <label className="custom-color-option">Custom color<input type="color" value={inkColor} onChange={(event) => setInkColor(event.target.value)} /></label>
                    </div>}
                  </div>}
                </div>

                <div className="toolbar-divider" />
                
                <div className="toolbar-section slider">
                  <input 
                    type="range" 
                    className="toolbar-slider"
                    min={tool === 'eraser' ? 6 : 1} 
                    max={tool === 'eraser' ? 60 : 12} 
                    value={tool === 'eraser' ? eraserWidth : penWidth} 
                    onChange={(e) => tool === 'eraser' ? setEraserWidth(Number(e.target.value)) : setPenWidth(Number(e.target.value))} 
                    title="Size"
                  />
                  <div className="size-indicator" style={{ width: `${tool === 'eraser' ? eraserWidth : penWidth}px`, height: `${tool === 'eraser' ? eraserWidth : penWidth}px` }} />
                </div>
                
                <div className="toolbar-divider" />
                
                <div className="toolbar-section">
                  <button className="floating-tool-btn" onClick={clearCanvas} title="Clear All">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default App
