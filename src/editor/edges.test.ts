import { describe, expect, it } from 'vitest'
import { routeEdge } from './edges.js'

describe('routeEdge', () => {
  it('connects ordinary forward edges from right to left', () => {
    const route = routeEdge(
      { x: 40, y: 40, width: 240, height: 112 },
      { x: 376, y: 40, width: 240, height: 112 },
    )

    expect(route.wrapped).toBe(false)
    expect(route.path).toMatch(/^M 280 96 /)
    expect(route.path).toMatch(/376 96$/)
  })

  it('connects wrapped edges from the source bottom to the target top', () => {
    const route = routeEdge(
      { x: 1048, y: 40, width: 240, height: 112 },
      { x: 40, y: 296, width: 240, height: 112 },
    )

    expect(route.wrapped).toBe(true)
    expect(route.path).toMatch(/^M 1168 152 /)
    expect(route.path).toMatch(/160 296$/)
  })

  it('connects an upper-left target from source top to target bottom', () => {
    const route = routeEdge(
      { x: 1048, y: 296, width: 240, height: 112 },
      { x: 40, y: 40, width: 240, height: 112 },
    )

    expect(route.wrapped).toBe(true)
    expect(route.path).toMatch(/^M 1168 296 /)
    expect(route.path).toMatch(/160 152$/)
  })
})