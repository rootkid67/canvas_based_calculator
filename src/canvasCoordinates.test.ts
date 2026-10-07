import { describe, expect, it } from 'vitest'
import { clientToCanvasPoint } from './canvasCoordinates'

describe('clientToCanvasPoint', () => {
  it('converts viewport coordinates to canvas CSS-pixel coordinates', () => {
    expect(clientToCanvasPoint(175, 240, { left: 100, top: 80 })).toEqual({ x: 75, y: 160 })
  })

  it('preserves fractional coordinates for high-DPI pointer input', () => {
    expect(clientToCanvasPoint(100.5, 80.25, { left: 100, top: 80 })).toEqual({ x: 0.5, y: 0.25 })
  })

  it('supports points above or to the left of the canvas origin', () => {
    expect(clientToCanvasPoint(90, 70, { left: 100, top: 80 })).toEqual({ x: -10, y: -10 })
  })
})
