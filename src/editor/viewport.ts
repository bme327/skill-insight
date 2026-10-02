import type { GraphLayout } from './layout.js'

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2
export const ZOOM_STEP = 0.1

export interface ViewportSize {
  readonly width: number
  readonly height: number
}

export interface Viewport {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function stepZoom(zoom: number, direction: -1 | 1): number {
  if (direction === 1 && zoom < MIN_ZOOM) return MIN_ZOOM
  if (direction === -1 && zoom <= MIN_ZOOM) return zoom
  return clampZoom(Math.round((zoom + direction * ZOOM_STEP) * 100) / 100)
}

export function fitGraphZoom(layout: GraphLayout, viewport: ViewportSize, padding = 24): number {
  const availableWidth = Math.max(1, viewport.width - padding * 2)
  const availableHeight = Math.max(1, viewport.height - padding * 2)
  return Math.min(
    1,
    availableWidth / Math.max(1, layout.width),
    availableHeight / Math.max(1, layout.height),
  )
}

export function viewportFromScroll(
  scrollLeft: number,
  scrollTop: number,
  clientWidth: number,
  clientHeight: number,
  zoom: number,
): Viewport {
  const safeZoom = Math.max(Number.EPSILON, zoom)
  return {
    x: scrollLeft / safeZoom,
    y: scrollTop / safeZoom,
    width: clientWidth / safeZoom,
    height: clientHeight / safeZoom,
  }
}

export function needsMinimap(layout: GraphLayout, viewport: Viewport): boolean {
  return viewport.width + 1 < layout.width || viewport.height + 1 < layout.height
}

export function visibleNodeIds(layout: GraphLayout, viewport: Viewport, overscan = 160): string[] {
  const left = viewport.x - overscan
  const top = viewport.y - overscan
  const right = viewport.x + viewport.width + overscan
  const bottom = viewport.y + viewport.height + overscan

  return Object.entries(layout.nodes)
    .filter(([, node]) => node.x + node.width >= left && node.x <= right && node.y + node.height >= top && node.y <= bottom)
    .map(([nodeId]) => nodeId)
    .sort()
}