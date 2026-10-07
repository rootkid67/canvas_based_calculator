export type CanvasRect = Pick<DOMRect, 'left' | 'top'>
export type CanvasPoint = { x: number; y: number }

/** Convert viewport pointer coordinates into the canvas's CSS-pixel coordinates. */
export function clientToCanvasPoint(clientX: number, clientY: number, rect: CanvasRect): CanvasPoint {
  return { x: clientX - rect.left, y: clientY - rect.top }
}
