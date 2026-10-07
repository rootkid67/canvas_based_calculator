import { describe, expect, it } from 'vitest'
import { prepareRecognitionInput, toRecognitionStrokes, type CanvasStrokeForRecognition } from './strokePipeline'

const inkStroke: CanvasStrokeForRecognition = {
  points: [
    { x: 10.5, y: 20.25 },
    { x: 16, y: 24 },
    { x: 22, y: 29 },
    { x: 28, y: 34 },
    { x: 34, y: 39 },
    { x: 40, y: 44 },
  ],
  width: 4.5,
  style: 'pen',
}

describe('canvas-to-model stroke pipeline', () => {
  it('preserves CSS-pixel points and maps canvas width to model lineWidth', () => {
    expect(toRecognitionStrokes([inkStroke])).toEqual([{
      points: inkStroke.points,
      lineWidth: 4.5,
    }])
  })

  it('removes erased strokes before model preprocessing', () => {
    const erasedStroke = { ...inkStroke, style: 'eraser' as const }
    expect(toRecognitionStrokes([inkStroke, erasedStroke])).toEqual([{
      points: inkStroke.points,
      lineWidth: 4.5,
    }])
  })

  it('passes validated ink strokes into preprocessing and returns its tensor contract', () => {
    let preprocessedStrokes: ReturnType<typeof toRecognitionStrokes> = []
    const expectedInput = {
      tensor: new Float32Array([0, 0.5, 1]),
      height: 256,
      width: 128,
      mask: new Uint8Array([0, 0, 1]),
      maskHeight: 256,
      maskWidth: 128,
    }

    const result = prepareRecognitionInput([inkStroke, { ...inkStroke, style: 'eraser' }], (strokes) => {
      preprocessedStrokes = strokes
      return expectedInput
    })

    expect(preprocessedStrokes).toEqual([{ points: inkStroke.points, lineWidth: 4.5 }])
    expect(result).toBe(expectedInput)
  })

  it('rejects empty or insignificant ink before allocating model tensors', () => {
    let preprocessCalled = false
    expect(() => prepareRecognitionInput([], () => {
      preprocessCalled = true
      throw new Error('should not run')
    })).toThrow('Write a math expression on the canvas first.')
    expect(preprocessCalled).toBe(false)
  })
})
