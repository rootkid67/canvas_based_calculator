import {
  isStrokeMeaningful,
  preprocessStrokes,
  type PreprocessResult,
  type Stroke,
} from 'ink-on/core'

export type CanvasStrokeForRecognition = {
  points: { x: number; y: number }[]
  width: number
  style: 'pen' | 'calligraphy' | 'eraser'
}

/** Map editable canvas strokes to the ink-on model's stroke contract. */
export function toRecognitionStrokes(canvasStrokes: CanvasStrokeForRecognition[]): Stroke[] {
  return canvasStrokes
    .filter((stroke) => stroke.style !== 'eraser')
    .map((stroke) => ({ points: stroke.points, lineWidth: stroke.width }))
}

/** Validate ink and convert coordinates into the model's tensor and mask inputs. */
export function prepareRecognitionInput(
  canvasStrokes: CanvasStrokeForRecognition[],
  preprocess: (strokes: Stroke[]) => PreprocessResult = preprocessStrokes,
): PreprocessResult {
  const recognitionStrokes = toRecognitionStrokes(canvasStrokes)
  if (!isStrokeMeaningful(recognitionStrokes)) {
    throw new Error('Write a math expression on the canvas first.')
  }
  return preprocess(recognitionStrokes)
}
