import { InferenceEngine, loadVocab, type PreprocessResult, type RecognitionResult, type Vocab } from 'ink-on/core'
import { env } from 'onnxruntime-web'
import { prepareRecognitionInput, type CanvasStrokeForRecognition } from './strokePipeline'

type RecognitionRequest = { id: number; strokes: CanvasStrokeForRecognition[] }
type WorkerScope = {
  onmessage: ((event: MessageEvent<RecognitionRequest>) => void) | null
  postMessage: (message: { id: number; result?: RecognitionResult; processingMs?: number; error?: string }) => void
}

const workerScope = globalThis as unknown as WorkerScope

// ink-on defaults this to every logical CPU core. Keep enough parallelism for
// WASM without oversubscribing the device or starving the interactive UI.
const logicalCores = navigator.hardwareConcurrency || 4
env.wasm.numThreads = globalThis.crossOriginIsolated
  ? Math.min(4, Math.max(1, Math.ceil(logicalCores / 2)))
  : 1

// ink-on's preprocessing uses document.createElement('canvas'). In a worker,
// provide the same narrow canvas factory using OffscreenCanvas so preprocessing
// stays off the UI thread without requiring a DOM.
function installOffscreenCanvasDocument() {
  if ('document' in globalThis) return
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('This browser does not support off-thread canvas preprocessing.')
  }
  Object.defineProperty(globalThis, 'document', {
    value: {
      createElement: (tagName: string) => {
        if (tagName.toLowerCase() !== 'canvas') {
          throw new Error(`Unsupported element requested in recognition worker: ${tagName}`)
        }
        return new OffscreenCanvas(1, 1)
      },
    },
  })
}

const engine = new InferenceEngine({
  encoderUrl: '/models/encoder_int8.onnx',
  decoderUrl: '/models/decoder_int8.onnx',
  beamWidth: 4,
  executionProvider: 'wasm',
})

let vocabPromise: Promise<Vocab> | undefined
let enginePromise: Promise<void> | undefined

async function initialize() {
  vocabPromise ??= loadVocab('/models/vocab.json').catch((error: unknown) => {
    vocabPromise = undefined
    throw error
  })
  enginePromise ??= engine.init().catch((error: unknown) => {
    enginePromise = undefined
    throw error
  })
  await Promise.all([vocabPromise, enginePromise])
}

workerScope.onmessage = async ({ data }) => {
  const startedAt = performance.now()
  try {
    installOffscreenCanvasDocument()
    const input: PreprocessResult = prepareRecognitionInput(data.strokes)
    await initialize()
    const result = await engine.recognize(input, await vocabPromise!, 'number')
    workerScope.postMessage({ id: data.id, result, processingMs: performance.now() - startedAt })
  } catch (error) {
    workerScope.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) })
  }
}
