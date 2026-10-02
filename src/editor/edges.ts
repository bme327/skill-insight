export interface EdgeRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface EdgeRoute {
  readonly path: string
  readonly wrapped: boolean
}

export function routeEdge(from: EdgeRect, to: EdgeRect): EdgeRoute {
  if (to.x < from.x && to.y !== from.y) {
    const downward = to.y > from.y
    const startX = from.x + from.width / 2
    const startY = downward ? from.y + from.height : from.y
    const endX = to.x + to.width / 2
    const endY = downward ? to.y : to.y + to.height
    const middleY = startY + (endY - startY) / 2
    const direction = downward ? 1 : -1
    const bend = Math.min(56, Math.max(24, Math.abs(endY - startY) / 3))
    return {
      path: `M ${startX} ${startY} C ${startX} ${startY + direction * bend}, ${startX} ${middleY}, ${startX - bend} ${middleY} L ${endX + bend} ${middleY} C ${endX} ${middleY}, ${endX} ${endY - direction * bend}, ${endX} ${endY}`,
      wrapped: true,
    }
  }

  const forward = to.x >= from.x
  const startX = forward ? from.x + from.width : from.x
  const startY = from.y + from.height / 2
  const endX = forward ? to.x : to.x + to.width
  const endY = to.y + to.height / 2
  const bend = Math.max(48, Math.abs(endX - startX) / 2)
  const direction = forward ? 1 : -1
  return {
    path: `M ${startX} ${startY} C ${startX + direction * bend} ${startY}, ${endX - direction * bend} ${endY}, ${endX} ${endY}`,
    wrapped: false,
  }
}