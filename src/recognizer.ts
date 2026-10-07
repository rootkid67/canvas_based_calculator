import { type RecognitionResult } from 'ink-on/core'
import { evaluateCalculatorInput } from './arithmetic'
import { type CanvasStrokeForRecognition } from './strokePipeline'

type WorkerRecognitionResult = RecognitionResult & { processingMs: number }
type PendingInference = { resolve: (result: WorkerRecognitionResult) => void; reject: (error: Error) => void }
let inferenceWorker: Worker | undefined
let nextInferenceId = 0
const pendingInferences = new Map<number, PendingInference>()

function formatCalculatorInput(latex: string) {
  let input = latex
  for (let pass = 0; pass < 8; pass++) {
    const simplified = input.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1÷$2')
    if (simplified === input) break
    input = simplified
  }
  return input
    .replace(/\\times|\\cdot/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[^0-9.+\-×÷/=()]/g, '')
}

function getInferenceWorker() {
  if (inferenceWorker) return inferenceWorker
  const worker = new Worker(new URL('./recognizer.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<{ id: number; result?: RecognitionResult; processingMs?: number; error?: string }>) => {
    const pending = pendingInferences.get(event.data.id)
    if (!pending) return
    pendingInferences.delete(event.data.id)
    if (event.data.error) pending.reject(new Error(event.data.error))
    else if (event.data.result) pending.resolve({
      ...event.data.result,
      processingMs: event.data.processingMs ?? event.data.result.totalMs,
    })
    else pending.reject(new Error('The recognition worker returned an empty result.'))
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || 'The recognition worker stopped unexpectedly.')
    for (const pending of pendingInferences.values()) pending.reject(error)
    pendingInferences.clear()
    worker.terminate()
    if (inferenceWorker === worker) inferenceWorker = undefined
  }
  inferenceWorker = worker
  return worker
}

function runInference(strokes: CanvasStrokeForRecognition[]): Promise<WorkerRecognitionResult> {
  const worker = getInferenceWorker()
  const id = nextInferenceId++
  return new Promise<WorkerRecognitionResult>((resolve, reject) => {
    pendingInferences.set(id, { resolve, reject })
    try {
      // Tensor rendering and inference both run in the worker, keeping the UI
      // thread available for responsive canvas input.
      worker.postMessage({ id, strokes })
    } catch (error) {
      pendingInferences.delete(id)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export async function recognizeCanvasStrokes(canvasStrokes: CanvasStrokeForRecognition[]): Promise<WorkerRecognitionResult & { latex: string; answer: string | undefined; hasEquals: boolean }> {
  const result = await runInference(canvasStrokes)
  const latex = formatCalculatorInput(result.latex)
  const hasEquals = latex.includes('=')
  const evaluatedAnswer = evaluateCalculatorInput(latex)
  const answer = evaluatedAnswer ?? (hasEquals ? 'undefined' : undefined)
  return { ...result, latex, answer, hasEquals }
}
