import { z } from 'zod'
import type { SkillGraph } from '../ir/index.js'

const NODE_WIDTH = 240
const NODE_HEIGHT = 112
const LAYER_GAP = 152
const ROW_GAP = 48
const CANVAS_PADDING = 40
const ATTACHMENT_GAP = 8
const ATTACHMENT_TOP_GAP = 8
const SMALL_ATTACHMENT_HEIGHT = 40
const MEDIUM_ATTACHMENT_HEIGHT = 52
const RIGHT_ATTACHMENT_GAP = 8
const RIGHT_ATTACHMENT_WIDTH = 136

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

const editorRawSchema = z
  .object({
    positions: z.record(pointSchema),
  })
  .passthrough()

export interface Point {
  readonly x: number
  readonly y: number
}

export interface LayoutNode extends Point {
  readonly width: number
  readonly height: number
  readonly manual: boolean
}

export interface GraphLayout {
  readonly nodes: Readonly<Record<string, LayoutNode>>
  readonly width: number
  readonly height: number
}

export type LayoutAttachmentSize = 'small' | 'medium'
export type LayoutAttachmentPlacement = 'below' | 'right'

export interface LayoutAttachment {
  readonly parentId: string
  readonly size: LayoutAttachmentSize
  readonly placement?: LayoutAttachmentPlacement
}

export interface LayoutOptions {
  readonly attachments?: Readonly<Record<string, LayoutAttachment>>
}

function positionOverrides(graph: SkillGraph): Readonly<Record<string, Point>> {
  const parsed = editorRawSchema.safeParse(graph.raw.visualEditor)
  return parsed.success ? parsed.data.positions : {}
}

function nodeLayers(graph: SkillGraph, excludedNodeIds: ReadonlySet<string>): ReadonlyMap<string, number> {
  const layerNodeIds = graph.nodes.filter((node) => !excludedNodeIds.has(node.id)).map((node) => node.id)
  const layers = new Map(layerNodeIds.map((nodeId) => [nodeId, 0]))
  const indegree = new Map(layerNodeIds.map((nodeId) => [nodeId, 0]))

  for (const edge of graph.edges) {
    if (!indegree.has(edge.from) || !indegree.has(edge.to)) continue
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
  }

  const ready = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId)
    .sort()

  while (ready.length > 0) {
    const nodeId = ready.shift()
    if (nodeId === undefined) break

    for (const edge of graph.edges) {
      if (edge.from !== nodeId || !indegree.has(edge.to)) continue
      layers.set(edge.to, Math.max(layers.get(edge.to) ?? 0, (layers.get(nodeId) ?? 0) + 1))
      const nextIndegree = (indegree.get(edge.to) ?? 0) - 1
      indegree.set(edge.to, nextIndegree)
      if (nextIndegree === 0) {
        ready.push(edge.to)
        ready.sort()
      }
    }
  }

  return layers
}

function attachmentHeight(size: LayoutAttachmentSize): number {
  return size === 'medium' ? MEDIUM_ATTACHMENT_HEIGHT : SMALL_ATTACHMENT_HEIGHT
}

function chunkAttachments(nodeIds: readonly string[]): readonly (readonly string[])[] {
  const rows: string[][] = []
  for (let index = 0; index < nodeIds.length; index += 2) rows.push(nodeIds.slice(index, index + 2))
  return rows
}

export function layoutGraph(graph: SkillGraph, clientWidth?: number, options: LayoutOptions = {}): GraphLayout {
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id))
  const attachments = Object.fromEntries(Object.entries(options.attachments ?? {}).filter(([nodeId, attachment]) =>
    graphNodeIds.has(nodeId) && graphNodeIds.has(attachment.parentId) && nodeId !== attachment.parentId))
  const attachedNodeIds = new Set(Object.keys(attachments))
  const belowAttachmentsByParent = new Map<string, string[]>()
  const rightAttachmentsByParent = new Map<string, string[]>()
  for (const [nodeId, attachment] of Object.entries(attachments)) {
    const collection = attachment.placement === 'right' ? rightAttachmentsByParent : belowAttachmentsByParent
    const nodeIds = collection.get(attachment.parentId) ?? []
    nodeIds.push(nodeId)
    collection.set(attachment.parentId, nodeIds)
  }
  for (const nodeIds of [...belowAttachmentsByParent.values(), ...rightAttachmentsByParent.values()]) {
    nodeIds.sort((left, right) => {
      const leftSize = attachments[left]?.size
      const rightSize = attachments[right]?.size
      if (leftSize !== rightSize) return leftSize === 'medium' ? -1 : 1
      return left.localeCompare(right)
    })
  }

  const attachmentRows = (parentId: string): readonly (readonly string[])[] =>
    chunkAttachments(belowAttachmentsByParent.get(parentId) ?? [])
  const nodeFootprintHeight = (nodeId: string): number => {
    const rows = attachmentRows(nodeId)
    const belowHeight = rows.length === 0 ? NODE_HEIGHT : NODE_HEIGHT + ATTACHMENT_TOP_GAP + rows.reduce((height, row, index) => {
      const rowHeight = Math.max(...row.map((attachmentId) => attachmentHeight(attachments[attachmentId]?.size ?? 'small')))
      return height + rowHeight + (index === 0 ? 0 : ATTACHMENT_GAP)
    }, 0)
    const rightNodeIds = rightAttachmentsByParent.get(nodeId) ?? []
    const rightHeight = rightNodeIds.reduce((height, attachmentId, index) =>
      height + attachmentHeight(attachments[attachmentId]?.size ?? 'small') + (index === 0 ? 0 : ATTACHMENT_GAP), 0)
    return Math.max(belowHeight, rightHeight)
  }

  const layers = nodeLayers(graph, attachedNodeIds)
  const overrides = positionOverrides(graph)
  const rows = new Map<number, string[]>()

  for (const node of [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (attachedNodeIds.has(node.id)) continue
    const layer = layers.get(node.id) ?? 0
    const row = rows.get(layer) ?? []
    row.push(node.id)
    rows.set(layer, row)
  }

  const availableWidth = clientWidth === undefined ? undefined : Math.max(1, clientWidth)
  const canvasPadding = availableWidth === undefined
    ? CANVAS_PADDING
    : Math.min(CANVAS_PADDING, Math.max(12, (availableWidth - NODE_WIDTH) / 2))
  const nodeWidth = availableWidth === undefined
    ? NODE_WIDTH
    : Math.min(NODE_WIDTH, Math.max(1, availableWidth - canvasPadding * 2))
  const columns = availableWidth === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(1, Math.floor((availableWidth - canvasPadding * 2 + LAYER_GAP) / (nodeWidth + LAYER_GAP)))
  const sortedLayers = [...rows.keys()].sort((left, right) => left - right)
  const bandHeights = new Map<number, number>()

  sortedLayers.forEach((layer, index) => {
    const band = Math.floor(index / columns)
    const nodeIds = rows.get(layer) ?? []
    const layerHeight = nodeIds.reduce((height, nodeId, row) =>
      height + nodeFootprintHeight(nodeId) + (row === 0 ? 0 : ROW_GAP), 0)
    bandHeights.set(band, Math.max(bandHeights.get(band) ?? 0, layerHeight))
  })

  const bandOffsets = new Map<number, number>()
  let nextBandY = canvasPadding
  for (const [band, bandHeight] of bandHeights) {
    bandOffsets.set(band, nextBandY)
    nextBandY += bandHeight + LAYER_GAP
  }

  const nodes: Record<string, LayoutNode> = {}
  sortedLayers.forEach((layer, index) => {
    const nodeIds = rows.get(layer) ?? []
    const band = Math.floor(index / columns)
    const column = index % columns
    let nextRowY = bandOffsets.get(band) ?? canvasPadding
    nodeIds.forEach((nodeId, row) => {
      const automatic = {
        x: canvasPadding + column * (nodeWidth + LAYER_GAP),
        y: nextRowY,
      }
      const override = overrides[nodeId]
      nodes[nodeId] = {
        ...(override ?? automatic),
        width: nodeWidth,
        height: NODE_HEIGHT,
        manual: override !== undefined,
      }
      nextRowY += nodeFootprintHeight(nodeId) + (row === nodeIds.length - 1 ? 0 : ROW_GAP)
    })
  })

  for (const parentId of new Set([...belowAttachmentsByParent.keys(), ...rightAttachmentsByParent.keys()])) {
    const parent = nodes[parentId]
    if (parent === undefined) continue
    let rowY = parent.y + parent.height + ATTACHMENT_TOP_GAP
    for (const row of attachmentRows(parentId)) {
      const availableWidth = parent.width - ATTACHMENT_GAP * Math.max(0, row.length - 1)
      const weights = row.map((nodeId) => attachments[nodeId]?.size === 'medium' ? 1.35 : 1)
      const totalWeight = weights.reduce((total, weight) => total + weight, 0)
      let rowX = parent.x
      row.forEach((nodeId, index) => {
        const attachment = attachments[nodeId]
        if (attachment === undefined) return
        const remainingWidth = parent.x + parent.width - rowX
        const width = row.length === 1
          ? parent.width * (attachment.size === 'medium' ? 0.68 : 0.48)
          : index === row.length - 1
            ? remainingWidth
            : availableWidth * (weights[index] ?? 1) / totalWeight
        nodes[nodeId] = {
          x: rowX,
          y: rowY,
          width,
          height: attachmentHeight(attachment.size),
          manual: false,
        }
        rowX += width + ATTACHMENT_GAP
      })
      rowY += Math.max(...row.map((nodeId) => attachmentHeight(attachments[nodeId]?.size ?? 'small'))) + ATTACHMENT_GAP
    }

    const rightNodeIds = rightAttachmentsByParent.get(parentId) ?? []
    const rightHeight = rightNodeIds.reduce((height, nodeId, index) =>
      height + attachmentHeight(attachments[nodeId]?.size ?? 'small') + (index === 0 ? 0 : ATTACHMENT_GAP), 0)
    let rightY = parent.y + Math.max(0, (parent.height - rightHeight) / 2)
    for (const nodeId of rightNodeIds) {
      const attachment = attachments[nodeId]
      if (attachment === undefined) continue
      const height = attachmentHeight(attachment.size)
      nodes[nodeId] = {
        x: parent.x + parent.width + RIGHT_ATTACHMENT_GAP,
        y: rightY,
        width: Math.min(RIGHT_ATTACHMENT_WIDTH, parent.width),
        height,
        manual: false,
      }
      rightY += height + ATTACHMENT_GAP
    }
  }

  const extents = Object.values(nodes)
  const contentWidth = Math.max(0, ...extents.map((node) => node.x + node.width + canvasPadding))
  return {
    nodes,
    width: availableWidth === undefined
      ? Math.max(800, ...extents.map((node) => node.x + node.width + CANVAS_PADDING))
      : Math.max(availableWidth, contentWidth),
    height: Math.max(500, ...extents.map((node) => node.y + node.height + canvasPadding)),
  }
}

export function applyNodePosition(graph: SkillGraph, nodeId: string, position: Point): SkillGraph {
  if (!graph.nodes.some((node) => node.id === nodeId)) return graph

  const nextPosition = pointSchema.parse(position)
  const current = editorRawSchema.safeParse(graph.raw.visualEditor)
  const visualEditor = current.success ? current.data : { positions: {} }

  return {
    ...graph,
    raw: {
      ...graph.raw,
      visualEditor: {
        ...visualEditor,
        positions: { ...visualEditor.positions, [nodeId]: nextPosition },
      },
    },
  }
}