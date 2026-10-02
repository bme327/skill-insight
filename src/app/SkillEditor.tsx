import { useCallback, useDeferredValue, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { z } from 'zod'
import {
  AlertTriangle,
  Box,
  Braces,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Eye,
  FileText,
  GitBranch,
  GripVertical,
  Layers3,
  Minus,
  Plus,
  RadioTower,
  Redo2,
  RotateCcw,
  Route,
  Scan,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Undo2,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  applyNodePosition,
  builtInFlowFilters,
  clampZoom,
  createEditorHistory,
  DEFAULT_FLOW_VIEW_STATE,
  fitGraphZoom,
  findingsByNode,
  layoutGraph,
  MAX_ZOOM,
  MIN_ZOOM,
  needsMinimap,
  nodeAtSourceOffset,
  projectFlowView,
  redo,
  routeEdge,
  stepZoom,
  undo,
  updateHistory,
  viewportFromScroll,
  visibleNodeIds,
} from '../editor/index.js'
import type { AssessmentStatus, DisplayNode, FlowProjection, FlowViewState, GroupDisplayNode, Point, ViewLevel, Viewport, ViewportSize } from '../editor/index.js'
import { nodeKindSchema, updateNode } from '../ir/index.js'
import type { Finding, NodeKind, SkillGraph, SourceSpan } from '../ir/index.js'
import { MarkdownPreview } from './MarkdownPreview.js'
import './skill-editor.css'

export interface SourceCursor {
  readonly uri: string
  readonly offset: number
}

export interface SkillEditorProps {
  readonly graph: SkillGraph
  readonly findings?: readonly Finding[]
  readonly outsideWorkspaceReferenceNodeIds?: readonly string[]
  readonly sourceCursor?: SourceCursor
  readonly className?: string
  readonly toolbarSearch?: ReactNode
  readonly assessment?: AssessmentStatus
  readonly onGraphChange?: (graph: SkillGraph) => void
  readonly onRevealSource?: (source: SourceSpan) => void
  readonly onRunAssessment?: (force: boolean) => void
}

interface DragState {
  readonly nodeId: string
  readonly pointerX: number
  readonly pointerY: number
  readonly origin: Point
}

interface PanState {
  readonly pointerId: number
  readonly pointerX: number
  readonly pointerY: number
  readonly scrollLeft: number
  readonly scrollTop: number
}

const NODE_ICONS: Record<NodeKind, LucideIcon> = {
  trigger: Zap,
  input: Braces,
  instruction: ChevronRight,
  condition: GitBranch,
  action: TerminalSquare,
  toolCall: Box,
  permission: ShieldCheck,
  validation: CircleCheck,
  output: Route,
  errorPath: AlertTriangle,
  reference: RotateCcw,
}

const NODE_KINDS: readonly NodeKind[] = [
  'trigger',
  'input',
  'instruction',
  'condition',
  'action',
  'toolCall',
  'permission',
  'validation',
  'output',
  'errorPath',
  'reference',
]
const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, width: 900, height: 600 }
const INITIAL_CANVAS_SIZE: ViewportSize = { width: 900, height: 600 }
const MINIMAP_SCROLL_CLEARANCE = { x: 192, y: 136 }
const VIEW_LEVELS: readonly { readonly id: ViewLevel; readonly label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'grouped', label: 'Grouped' },
  { id: 'detail', label: 'Detail' },
]
const flowViewStateSchema = z.object({
  level: z.enum(['overview', 'grouped', 'detail']),
  activeFilterIds: z.array(z.string()),
  groupExpansionOverrides: z.record(z.boolean()),
})

function flowViewStorageKey(graph: SkillGraph): string {
  return `skillInsights.flowView:${graph.id}:${graph.sourceUri}`
}

function graphSessionKey(graph: SkillGraph): string {
  return `${graph.id}:${graph.sourceUri}`
}

function readFlowViewState(key: string): FlowViewState {
  if (typeof localStorage === 'undefined') return DEFAULT_FLOW_VIEW_STATE
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    const parsed = flowViewStateSchema.safeParse(value)
    return parsed.success ? parsed.data : DEFAULT_FLOW_VIEW_STATE
  } catch {
    return DEFAULT_FLOW_VIEW_STATE
  }
}

function writeFlowViewState(key: string, state: FlowViewState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(state))
  } catch {
    // Local persistence is optional; the in-memory state remains usable.
  }
}

function groupLabel(group: GroupDisplayNode): string {
  return group.groupKind === 'references'
    ? `${group.childNodeIds.length} references`
    : `${group.childNodeIds.length} ${group.groupKind} blocks`
}

function graphForProjection(graph: SkillGraph, projection: FlowProjection): SkillGraph {
  const sourceNodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const nodes = projection.nodes.flatMap((displayNode) => {
    if (displayNode.type === 'source') {
      const sourceNode = sourceNodes.get(displayNode.sourceNodeId)
      return sourceNode === undefined ? [] : [sourceNode]
    }
    const children = displayNode.childNodeIds.flatMap((nodeId) => {
      const node = sourceNodes.get(nodeId)
      return node === undefined ? [] : [node]
    })
    const first = children[0]
    if (first === undefined) return []
    return [{
      id: displayNode.id,
      kind: displayNode.groupKind === 'references' ? 'reference' as const : displayNode.groupKind,
      title: groupLabel(displayNode),
      detail: displayNode.matchCount > 0
        ? `${displayNode.matchCount} of ${displayNode.childNodeIds.length} match active filters`
        : `${displayNode.childNodeIds.length} grouped blocks`,
      source: first.source,
      capabilities: children.flatMap((node) => node.capabilities),
      inferred: children.some((node) => node.inferred),
      confidence: Math.min(...children.map((node) => node.confidence)),
      raw: {},
    }]
  })
  return {
    ...graph,
    nodes,
    edges: projection.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      label: edge.label,
    })),
  }
}

function findingsForDisplayNode(
  displayNode: DisplayNode,
  findings: readonly Finding[],
  indexedFindings: ReadonlyMap<string, readonly Finding[]>,
): readonly Finding[] {
  if (displayNode.type === 'source') return indexedFindings.get(displayNode.sourceNodeId) ?? []
  const childIds = new Set(displayNode.childNodeIds)
  return findings.filter((finding) => finding.nodeIds.some((nodeId) => childIds.has(nodeId)))
}

export function SkillEditor({
  graph: inputGraph,
  findings = [],
  outsideWorkspaceReferenceNodeIds = [],
  sourceCursor,
  className = '',
  toolbarSearch,
  assessment,
  onGraphChange,
  onRevealSource,
  onRunAssessment,
}: SkillEditorProps) {
  const [history, setHistory] = useState(() => createEditorHistory(inputGraph))
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(inputGraph.nodes[0]?.id)
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT)
  const [canvasSize, setCanvasSize] = useState<ViewportSize>(INITIAL_CANVAS_SIZE)
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState<DragState | undefined>()
  const [dragPosition, setDragPosition] = useState<Point | undefined>()
  const [pan, setPan] = useState<PanState | undefined>()
  const [isMarkdownPreviewOpen, setIsMarkdownPreviewOpen] = useState(false)
  const detailId = useId()
  const markdownPreviewId = useId()
  const markdownPreviewTitleId = useId()
  const markdownPreviewButtonRef = useRef<HTMLButtonElement>(null)
  const markdownPreviewDialogRef = useRef<HTMLDialogElement>(null)
  const markdownPreviewCloseRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  const pendingZoomScroll = useRef<Point | undefined>(undefined)
  const graphSessionRef = useRef(graphSessionKey(inputGraph))
  const nodeRefs = useRef(new Map<string, HTMLDivElement>())
  const pendingFocusNodeId = useRef<string | undefined>(undefined)
  const edgeArrowId = `vss-edge-arrow-${useId().replaceAll(':', '')}`
  const graph = history.present
  const storageKey = flowViewStorageKey(graph)
  const [storedFlowView, setStoredFlowView] = useState(() => ({
    key: storageKey,
    state: readFlowViewState(storageKey),
  }))
  const flowView = storedFlowView.key === storageKey
    ? storedFlowView.state
    : readFlowViewState(storageKey)
  const projection = projectFlowView(
    graph,
    flowView,
    { findings, outsideWorkspaceReferenceNodeIds },
    builtInFlowFilters,
  )
  const displayGraph = graphForProjection(graph, projection)
  const layoutOptions = {
    attachments: Object.fromEntries(projection.nodes.flatMap((node) =>
      node.attachedToId === undefined || node.attachmentSize === undefined || node.attachmentPlacement === undefined
        ? []
        : [[node.id, { parentId: node.attachedToId, size: node.attachmentSize, placement: node.attachmentPlacement }]])),
  }
  const layout = layoutGraph(displayGraph, canvasSize.width, layoutOptions)
  const deferredViewport = useDeferredValue(viewport)
  const visibleIds = new Set(visibleNodeIds(layout, deferredViewport))
  const minimapVisible = needsMinimap(layout, viewport)
  const indexedFindings = findingsByNode(findings)
  const assessmentState = assessment?.state ?? 'unavailable'
  const assessmentSummary = assessment?.summary ?? ''
  const assessmentLabel = assessmentState === 'error'
    ? 'Retry AI assessment of this skill'
    : assessmentSummary === ''
      ? 'Run AI assessment of this skill'
      : 'Run AI assessment of this skill again'
  const assessmentTitle = assessment?.message
    ?? (assessmentState === 'ready'
      ? `Reviews this skill with ${assessment?.modelLabel ?? 'the default model'} and uses your Copilot allowance.`
      : 'AI assessment is unavailable.')
  const selectedDisplayNodeId = projection.nodes.some((node) => node.id === selectedNodeId)
    ? selectedNodeId
    : projection.nodes.find((node) => node.type === 'group' && node.childNodeIds.includes(selectedNodeId ?? ''))?.id
      ?? projection.nodes[0]?.id
  const selectedDisplayNode = projection.nodes.find((node) => node.id === selectedDisplayNodeId)
  const selectedNode = selectedDisplayNode?.type === 'source'
    ? graph.nodes.find((node) => node.id === selectedDisplayNode.sourceNodeId)
    : undefined
  const selectedGroup = selectedDisplayNode?.type === 'group' ? selectedDisplayNode : undefined
  const selectedExpandedGroup = selectedDisplayNode?.type === 'source' && selectedDisplayNode.groupId !== undefined
    ? projection.groups.find((group) => group.id === selectedDisplayNode.groupId)
    : undefined
  const SelectedIcon = selectedNode === undefined ? Box : NODE_ICONS[selectedNode.kind]

  useEffect(() => {
    const dialog = markdownPreviewDialogRef.current
    if (dialog === null) return
    if (isMarkdownPreviewOpen) {
      if (!dialog.open) dialog.showModal()
      markdownPreviewCloseRef.current?.focus()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [isMarkdownPreviewOpen])

  useEffect(() => {
    setIsMarkdownPreviewOpen(false)
  }, [selectedNode?.id])

  const updateFlowView = (update: (current: FlowViewState) => FlowViewState): void => {
    setStoredFlowView((current) => {
      const state = current.key === storageKey ? current.state : readFlowViewState(storageKey)
      return { key: storageKey, state: update(state) }
    })
  }

  const setGroupExpanded = (groupId: string, expanded: boolean, focusNodeId: string): void => {
    pendingFocusNodeId.current = focusNodeId
    setSelectedNodeId(focusNodeId)
    updateFlowView((current) => ({
      ...current,
      groupExpansionOverrides: { ...current.groupExpansionOverrides, [groupId]: expanded },
    }))
  }

  useEffect(() => {
    const nextGraphSession = graphSessionKey(inputGraph)
    if (graphSessionRef.current !== nextGraphSession) {
      graphSessionRef.current = nextGraphSession
      pendingZoomScroll.current = undefined
      zoomRef.current = 1
      setZoom(1)
      setPan(undefined)
      setDrag(undefined)
      setDragPosition(undefined)
      const canvas = canvasRef.current
      if (canvas !== null) {
        canvas.scrollTo({ left: 0, top: 0 })
        setViewport(viewportFromScroll(0, 0, canvas.clientWidth, canvas.clientHeight, 1))
      }
    }
    setHistory((current) => (current.present === inputGraph ? current : createEditorHistory(inputGraph)))
    setSelectedNodeId((current) =>
      current !== undefined && inputGraph.nodes.some((node) => node.id === current)
        ? current
        : inputGraph.nodes[0]?.id,
    )
  }, [inputGraph])

  useEffect(() => {
    if (storedFlowView.key !== storageKey) {
      setStoredFlowView({ key: storageKey, state: readFlowViewState(storageKey) })
    }
  }, [storageKey, storedFlowView.key])

  useEffect(() => {
    if (storedFlowView.key === storageKey) writeFlowViewState(storageKey, storedFlowView.state)
  }, [storageKey, storedFlowView])

  useEffect(() => {
    if (storedFlowView.key !== storageKey) return
    const knownFilterIds = new Set(builtInFlowFilters.map((filter) => filter.id))
    const knownGroupIds = new Set(projection.groups.map((group) => group.id))
    const activeFilterIds = storedFlowView.state.activeFilterIds.filter((filterId) => knownFilterIds.has(filterId))
    const groupExpansionOverrides = Object.fromEntries(
      Object.entries(storedFlowView.state.groupExpansionOverrides)
        .filter(([groupId]) => knownGroupIds.has(groupId)),
    )
    if (
      activeFilterIds.length === storedFlowView.state.activeFilterIds.length
      && Object.keys(groupExpansionOverrides).length === Object.keys(storedFlowView.state.groupExpansionOverrides).length
    ) return
    setStoredFlowView({
      key: storageKey,
      state: { ...storedFlowView.state, activeFilterIds, groupExpansionOverrides },
    })
  }, [projection.groups, storageKey, storedFlowView])

  useEffect(() => {
    const nodeId = pendingFocusNodeId.current
    if (nodeId === undefined) return
    const node = nodeRefs.current.get(nodeId)
    if (node === undefined) return
    node.focus()
    pendingFocusNodeId.current = undefined
  }, [projection])

  useEffect(() => {
    if (sourceCursor === undefined) return
    const node = nodeAtSourceOffset(graph, sourceCursor.uri, sourceCursor.offset)
    if (node === undefined) return
    setSelectedNodeId(node.id)
    const displayNode = projection.nodes.find((candidate) =>
      candidate.type === 'source'
        ? candidate.sourceNodeId === node.id
        : candidate.childNodeIds.includes(node.id))
    const position = displayNode === undefined
      ? undefined
      : layoutGraph(displayGraph, canvasSize.width, layoutOptions).nodes[displayNode.id]
    if (position !== undefined) {
      canvasRef.current?.scrollTo({
        left: Math.max(0, position.x * zoom - 40),
        top: Math.max(0, position.y * zoom - 40),
        behavior: 'smooth',
      })
    }
  }, [canvasSize.width, displayGraph, graph, projection.nodes, sourceCursor, zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const size = { width: canvas.clientWidth, height: canvas.clientHeight }
      setCanvasSize(size)
      setViewport(viewportFromScroll(
        canvas.scrollLeft,
        canvas.scrollTop,
        size.width,
        size.height,
        zoom,
      ))
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const pending = pendingZoomScroll.current
    if (pending !== undefined) {
      canvas.scrollTo({ left: pending.x, top: pending.y })
      pendingZoomScroll.current = undefined
    }
    setViewport(viewportFromScroll(
      canvas.scrollLeft,
      canvas.scrollTop,
      canvas.clientWidth,
      canvas.clientHeight,
      zoom,
    ))
  }, [zoom])

  const commitGraph = (nextGraph: SkillGraph): void => {
    setHistory((current) => updateHistory(current, nextGraph))
    onGraphChange?.(nextGraph)
  }

  const moveThroughHistory = (direction: 'undo' | 'redo'): void => {
    const next = direction === 'undo' ? undo(history) : redo(history)
    if (next === history) return
    setHistory(next)
    onGraphChange?.(next.present)
  }

  const beginDrag = (nodeId: string, pointerX: number, pointerY: number): void => {
    if (!graph.nodes.some((node) => node.id === nodeId)) return
    if (projection.nodes.some((node) => node.id === nodeId && node.attachedToId !== undefined)) return
    const position = layout.nodes[nodeId]
    if (position === undefined) return
    setSelectedNodeId(nodeId)
    setDrag({ nodeId, pointerX, pointerY, origin: position })
    setDragPosition(position)
  }

  const updateDrag = (pointerX: number, pointerY: number): void => {
    if (drag === undefined) return
    setDragPosition({
      x: Math.max(0, drag.origin.x + (pointerX - drag.pointerX) / zoom),
      y: Math.max(0, drag.origin.y + (pointerY - drag.pointerY) / zoom),
    })
  }

  const finishDrag = (): void => {
    const moved = drag !== undefined
      && dragPosition !== undefined
      && (drag.origin.x !== dragPosition.x || drag.origin.y !== dragPosition.y)
    if (moved && drag !== undefined && dragPosition !== undefined) {
      commitGraph(applyNodePosition(graph, drag.nodeId, dragPosition))
    }
    setDrag(undefined)
    setDragPosition(undefined)
  }

  const beginPan = (event: PointerEvent<HTMLDivElement>): void => {
    const target = event.target
    if (
      event.button !== 0
      || !(target instanceof Element)
      || target.closest('button, input, select, textarea, a, [role="button"]') !== null
    ) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setPan({
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    })
  }

  const updatePointer = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag !== undefined) {
      updateDrag(event.clientX, event.clientY)
      return
    }
    if (pan === undefined || pan.pointerId !== event.pointerId) return
    event.currentTarget.scrollLeft = pan.scrollLeft - (event.clientX - pan.pointerX)
    event.currentTarget.scrollTop = pan.scrollTop - (event.clientY - pan.pointerY)
  }

  const finishPointer = (): void => {
    finishDrag()
    setPan(undefined)
  }

  const setCanvasZoom = useCallback((nextZoom: number, anchorX?: number, anchorY?: number): void => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const currentZoom = zoomRef.current
    const next = clampZoom(nextZoom)
    if (next === currentZoom) return
    const x = anchorX ?? canvas.clientWidth / 2
    const y = anchorY ?? canvas.clientHeight / 2
    const graphX = (canvas.scrollLeft + x) / currentZoom
    const graphY = (canvas.scrollTop + y) / currentZoom
    pendingZoomScroll.current = {
      x: Math.max(0, graphX * next - x),
      y: Math.max(0, graphY * next - y),
    }
    zoomRef.current = next
    setZoom(next)
  }, [])

  const fitGraphToView = (): void => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const next = fitGraphZoom(layout, {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    })
    pendingZoomScroll.current = { x: 0, y: 0 }
    if (next === zoomRef.current) {
      canvas.scrollTo({ left: 0, top: 0 })
      setViewport(viewportFromScroll(0, 0, canvas.clientWidth, canvas.clientHeight, next))
      return
    }
    zoomRef.current = next
    setZoom(next)
  }

  const zoomWithWheel = useCallback((event: globalThis.WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const canvas = canvasRef.current
    if (canvas === null) return
    const bounds = canvas.getBoundingClientRect()
    const currentZoom = zoomRef.current
    const nextZoom = stepZoom(currentZoom, event.deltaY < 0 ? 1 : -1)
    if (nextZoom === currentZoom) return
    setCanvasZoom(
      nextZoom,
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    )
  }, [setCanvasZoom])

  const panFromMinimap = (event: PointerEvent<HTMLButtonElement>): void => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const minimap = event.currentTarget.querySelector('svg')
    if (!(minimap instanceof SVGSVGElement)) return
    const bounds = minimap.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const relativeX = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const relativeY = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    const graphX = relativeX * layout.width
    const graphY = relativeY * layout.height
    canvas.scrollTo({
      left: Math.max(0, graphX * zoom - canvas.clientWidth / 2),
      top: Math.max(0, graphY * zoom - canvas.clientHeight / 2),
    })
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    canvas.addEventListener('wheel', zoomWithWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', zoomWithWheel)
  }, [zoomWithWheel])

  const panMinimapWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const movements: Partial<Record<string, Point>> = {
      ArrowLeft: { x: -canvas.clientWidth * 0.8, y: 0 },
      ArrowRight: { x: canvas.clientWidth * 0.8, y: 0 },
      ArrowUp: { x: 0, y: -canvas.clientHeight * 0.8 },
      ArrowDown: { x: 0, y: canvas.clientHeight * 0.8 },
    }
    const movement = movements[event.key]
    if (movement !== undefined) {
      event.preventDefault()
      canvas.scrollBy({ left: movement.x, top: movement.y })
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      canvas.scrollTo({ left: 0, top: 0 })
    } else if (event.key === 'End') {
      event.preventDefault()
      canvas.scrollTo({ left: canvas.scrollWidth, top: canvas.scrollHeight })
    }
  }

  const livePosition = (nodeId: string) => {
    const position = layout.nodes[nodeId]
    if (position === undefined || drag?.nodeId !== nodeId || dragPosition === undefined) return position
    return { ...position, ...dragPosition }
  }

  const nudgeNode = (event: KeyboardEvent<HTMLDivElement>, nodeId: string): void => {
    if (!graph.nodes.some((node) => node.id === nodeId)) return
    if (projection.nodes.some((node) => node.id === nodeId && node.attachedToId !== undefined)) return
    const deltas: Partial<Record<string, Point>> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }
    const delta = deltas[event.key]
    const position = layout.nodes[nodeId]
    if (delta === undefined || position === undefined) return
    event.preventDefault()
    const step = event.shiftKey ? 24 : 8
    commitGraph(applyNodePosition(graph, nodeId, {
      x: Math.max(0, position.x + delta.x * step),
      y: Math.max(0, position.y + delta.y * step),
    }))
  }

  return (
    <section className={`vss-editor ${className}`.trim()} aria-label={`Visual editor for ${graph.name}`}>
      <header className={`vss-toolbar${toolbarSearch === undefined ? '' : ' has-search'}`}>
        <div className="vss-brand"><Sparkles size={17} /><strong>Skill Insights</strong></div>
        <div className="vss-skill-name"><span>{graph.provider}</span><strong title={graph.name}>{graph.name}</strong></div>
        {toolbarSearch !== undefined && <div className="vss-toolbar-search">{toolbarSearch}</div>}
        <div className="vss-toolbar-actions">
          <span className="vss-node-count">{projection.nodes.length} shown / {graph.nodes.length}</span>
          {onRunAssessment !== undefined && (
            <button
              type="button"
              className={`vss-ai-button${assessmentState === 'running' ? ' is-running' : ''}`}
              disabled={assessmentState === 'running' || assessmentState === 'unavailable'}
              aria-busy={assessmentState === 'running'}
              aria-label={assessmentLabel}
              title={assessmentTitle}
              onClick={() => onRunAssessment(assessment?.summary !== undefined && assessment.summary !== '')}
            >
              <Sparkles size={15} />{assessmentState === 'running' ? 'Assessing…' : assessmentState === 'error' ? 'Retry assessment' : 'AI Assessment'}
            </button>
          )}
          <button type="button" aria-label="Undo" disabled={history.past.length === 0} onClick={() => moveThroughHistory('undo')}><Undo2 size={16} /></button>
          <button type="button" aria-label="Redo" disabled={history.future.length === 0} onClick={() => moveThroughHistory('redo')}><Redo2 size={16} /></button>
        </div>
      </header>

      {assessmentSummary !== '' && (
        <details className="vss-ai-summary">
          <summary><Sparkles size={13} /> AI summary{assessment?.lastRunAt === undefined ? '' : ` · ${assessment.lastRunAt.slice(0, 10)}`}</summary>
          <MarkdownPreview markdown={assessmentSummary} />
        </details>
      )}

      <div className="vss-view-bar">
        <div className="vss-view-levels" role="group" aria-label="Graph detail level">
          <Layers3 size={15} aria-hidden="true" />
          {VIEW_LEVELS.map((level) => (
            <button
              type="button"
              key={level.id}
              aria-pressed={flowView.level === level.id}
              onClick={() => updateFlowView((current) => ({
                ...current,
                level: level.id,
                groupExpansionOverrides: {},
              }))}
            >
              {level.label}
            </button>
          ))}
        </div>
        <div className="vss-filters" role="group" aria-label="Graph filters">
          {builtInFlowFilters.map((filter) => {
            const active = flowView.activeFilterIds.includes(filter.id)
            const FilterIcon = filter.id === 'dangerous'
              ? ShieldAlert
              : filter.id === 'external'
                ? RadioTower
                : AlertTriangle
            return (
              <button
                type="button"
                key={filter.id}
                aria-pressed={active}
                onClick={() => updateFlowView((current) => ({
                  ...current,
                  activeFilterIds: active
                    ? current.activeFilterIds.filter((id) => id !== filter.id)
                    : [...current.activeFilterIds, filter.id],
                }))}
              >
                <FilterIcon size={14} aria-hidden="true" />{filter.label}
              </button>
            )
          })}
          {flowView.activeFilterIds.length > 0 && (
            <button
              type="button"
              className="vss-clear-filters"
              aria-label="Clear graph filters"
              title="Clear filters"
              onClick={() => updateFlowView((current) => ({ ...current, activeFilterIds: [] }))}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="vss-filter-status" role="status" aria-live="polite">
          {flowView.activeFilterIds.length === 0
            ? `${projection.totalSourceNodeCount} blocks`
            : `${projection.matchingSourceNodeCount} of ${projection.totalSourceNodeCount} blocks match`}
        </div>
      </div>

      <div className="vss-workspace">
        <div className="vss-canvas-shell">
          <div
            className={`vss-canvas${pan === undefined ? '' : ' is-panning'}`}
            role="region"
            aria-label="Graph canvas"
            ref={canvasRef}
            onPointerDown={beginPan}
            onPointerMove={updatePointer}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
            onScroll={(event) => {
              const target = event.currentTarget
              setViewport(viewportFromScroll(
                target.scrollLeft,
                target.scrollTop,
                target.clientWidth,
                target.clientHeight,
                zoom,
              ))
            }}
          >
            <div
              className="vss-canvas-space"
              style={{
                width: layout.width * zoom + (minimapVisible ? MINIMAP_SCROLL_CLEARANCE.x : 0),
                height: layout.height * zoom + (minimapVisible ? MINIMAP_SCROLL_CLEARANCE.y : 0),
              }}
            >
              <div
                className="vss-canvas-content"
                style={{
                  width: layout.width,
                  height: layout.height,
                  transform: `scale(${zoom})`,
                }}
              >
            <svg className="vss-edges" width={layout.width} height={layout.height} aria-hidden="true">
              <defs>
                <marker id={edgeArrowId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path className="vss-edge-arrow" d="M 1 1 L 7 4 L 1 7" />
                </marker>
              </defs>
              {displayGraph.edges.map((edge) => {
                if (!visibleIds.has(edge.from) && !visibleIds.has(edge.to)) return null
                const from = livePosition(edge.from)
                const to = livePosition(edge.to)
                if (from === undefined || to === undefined) return null
                const route = routeEdge(from, to)
                return (
                  <g className="vss-edge-group" key={edge.id}>
                    <path className="vss-edge-hit" d={route.path} />
                    <path className={`vss-edge vss-edge-${edge.kind}${route.wrapped ? ' is-wrapped' : ''}`} d={route.path} markerEnd={`url(#${edgeArrowId})`} />
                  </g>
                )
              })}
            </svg>

            {projection.nodes.map((displayNode) => {
              if (!visibleIds.has(displayNode.id)) return null
              const node = displayGraph.nodes.find((candidate) => candidate.id === displayNode.id)
              if (node === undefined) return null
              const basePosition = layout.nodes[displayNode.id]
              if (basePosition === undefined) return null
              const position = livePosition(displayNode.id) ?? basePosition
              const nodeFindings = findingsForDisplayNode(displayNode, findings, indexedFindings)
              const primaryFinding = nodeFindings[0]
              const Icon = NODE_ICONS[node.kind]
              const isGroup = displayNode.type === 'group'
              const isAttached = displayNode.attachedToId !== undefined && displayNode.attachmentSize !== undefined
              const expandedGroup = displayNode.type === 'source' && displayNode.groupId !== undefined
                ? projection.groups.find((group) => group.id === displayNode.groupId && group.expanded)
                : undefined
              const expandedGroupLabel = expandedGroup === undefined
                ? ''
                : expandedGroup.kind === 'references'
                  ? `${expandedGroup.childNodeIds.length} references`
                  : `${expandedGroup.childNodeIds.length} ${expandedGroup.kind} blocks`
              const tooltipId = `vss-node-tooltip-${encodeURIComponent(displayNode.id)}`
              const accessibleLabel = isGroup
                ? `Inspect collapsed group, ${groupLabel(displayNode)}, ${displayNode.matchCount} filter matches, ${displayNode.findingCount} findings`
                : `Inspect ${node.title}${isAttached ? `, attached ${node.kind}` : ''}${displayNode.contextOnly ? ', flow context' : ''}`
              return (
                <div
                  role="button"
                  tabIndex={0}
                  ref={(element) => {
                    if (element === null) nodeRefs.current.delete(displayNode.id)
                    else nodeRefs.current.set(displayNode.id, element)
                  }}
                  data-display-node-id={displayNode.id}
                  className={`vss-node vss-kind-${node.kind}${isGroup ? ' is-group' : ''}${expandedGroup === undefined ? '' : ' has-group-collapse'}${isAttached ? ` is-attached is-attached-${displayNode.attachmentSize}` : ''}${displayNode.contextOnly ? ' is-context' : ''}${selectedDisplayNodeId === displayNode.id ? ' is-selected' : ''}${primaryFinding === undefined ? '' : ` has-${primaryFinding.severity}`}`}
                  style={{ left: position.x, top: position.y, width: basePosition.width, height: basePosition.height }}
                  aria-label={accessibleLabel}
                  aria-describedby={isAttached ? tooltipId : undefined}
                  aria-pressed={selectedDisplayNodeId === displayNode.id}
                  key={displayNode.id}
                  onClick={() => setSelectedNodeId(displayNode.id)}
                  onPointerDown={(event) => {
                    if (isGroup || isAttached) return
                    event.currentTarget.setPointerCapture(event.pointerId)
                    beginDrag(displayNode.id, event.clientX, event.clientY)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedNodeId(displayNode.id)
                      return
                    }
                    nudgeNode(event, displayNode.id)
                  }}
                >
                  <span className="vss-node-accent" />
                  <span className="vss-node-icon"><Icon size={17} /></span>
                  <span className="vss-node-copy"><small>{node.kind}</small><strong>{node.title || 'Untitled block'}</strong><span>{node.detail || 'No details'}</span></span>
                  {displayNode.type === 'source' && !isAttached ? (
                    <button
                      type="button"
                      className="vss-node-source"
                      aria-label={`Go to source for ${node.title}`}
                      title="Go to source"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedNodeId(node.id)
                        onRevealSource?.(node.source)
                      }}
                    >
                      <Braces size={14} />
                    </button>
                  ) : displayNode.type === 'group' && !isAttached ? (
                    <button
                      type="button"
                      className="vss-node-source"
                      aria-label={`Expand ${groupLabel(displayNode)}`}
                      title="Expand group"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        const firstChildId = displayNode.childNodeIds[0]
                        if (firstChildId !== undefined) setGroupExpanded(displayNode.id, true, firstChildId)
                      }}
                    >
                      <ChevronDown size={14} />
                    </button>
                  ) : null}
                  {expandedGroup !== undefined && (
                    <button
                      type="button"
                      className="vss-node-collapse"
                      aria-label={`Collapse ${expandedGroupLabel}`}
                      title="Collapse group"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        setGroupExpanded(expandedGroup.id, false, expandedGroup.id)
                      }}
                    >
                      <ChevronUp size={14} />
                    </button>
                  )}
                  {!isAttached && (isGroup ? <Layers3 className="vss-node-grip" size={15} /> : <GripVertical className="vss-node-grip" size={15} />)}
                  {primaryFinding !== undefined && <span className="vss-finding-badge" title={primaryFinding.message}><AlertTriangle size={13} />{nodeFindings.length}</span>}
                  {isAttached && (
                    <span className="vss-node-tooltip" id={tooltipId} role="tooltip">
                      <strong>{node.title || 'Untitled block'}</strong>
                      <span>{node.detail || 'No details'}</span>
                      {nodeFindings.length > 0 && <small>{nodeFindings.length} finding{nodeFindings.length === 1 ? '' : 's'}</small>}
                    </span>
                  )}
                </div>
              )
            })}
            {projection.nodes.length === 0 && (
              <div className="vss-empty-results">
                <ShieldAlert size={22} />
                <strong>No matching blocks</strong>
                <button type="button" onClick={() => updateFlowView((current) => ({ ...current, activeFilterIds: [] }))}>Clear filters</button>
              </div>
            )}
              </div>
            </div>
          </div>
          <div className="vss-canvas-overlay">
            {minimapVisible && (
              <button
                type="button"
                className="vss-minimap"
                aria-label="Pan graph using minimap"
                aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End"
                title="Select a location to center the graph, or use arrow keys to pan"
                onPointerDown={panFromMinimap}
                onKeyDown={panMinimapWithKeyboard}
              >
                <svg
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {Object.entries(layout.nodes).map(([nodeId, node]) => (
                    <rect
                      className="vss-minimap-node"
                      key={nodeId}
                      x={node.x}
                      y={node.y}
                      width={node.width}
                      height={node.height}
                    />
                  ))}
                  <rect
                    className="vss-minimap-viewport"
                    x={viewport.x}
                    y={viewport.y}
                    width={Math.min(viewport.width, layout.width)}
                    height={Math.min(viewport.height, layout.height)}
                  />
                </svg>
              </button>
            )}
            <div className="vss-zoom-controls" role="group" aria-label="Graph zoom controls">
              <span className="vss-zoom-label">Zoom</span>
              <button
                type="button"
                aria-label="Zoom out"
                title="Zoom out"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => setCanvasZoom(stepZoom(zoom, -1))}
              >
                <Minus size={15} />
              </button>
              <output aria-live="polite" title="Current graph zoom">{Math.round(zoom * 100)}%</output>
              <button
                type="button"
                aria-label="Zoom in"
                title="Zoom in"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => setCanvasZoom(stepZoom(zoom, 1))}
              >
                <Plus size={15} />
              </button>
              <button
                type="button"
                aria-label="Fit graph to view"
                title="Fit graph to view"
                onClick={fitGraphToView}
              >
                <Scan size={15} />
              </button>
            </div>
          </div>
        </div>

        <aside className="vss-inspector" aria-label="Block inspector">
          {selectedGroup !== undefined ? (
            <>
              <div className="vss-inspector-heading">
                <span className="vss-inspector-icon"><Layers3 size={18} /></span>
                <div><small>Collapsed group</small><h2>{groupLabel(selectedGroup)}</h2></div>
              </div>
              <dl className="vss-group-summary">
                <div><dt>Blocks</dt><dd>{selectedGroup.childNodeIds.length}</dd></div>
                <div><dt>Matches</dt><dd>{selectedGroup.matchCount}</dd></div>
                <div><dt>Findings</dt><dd>{selectedGroup.findingCount}</dd></div>
              </dl>
              <button
                type="button"
                className="vss-group-action"
                onClick={() => {
                  const firstChildId = selectedGroup.childNodeIds[0]
                  if (firstChildId !== undefined) setGroupExpanded(selectedGroup.id, true, firstChildId)
                }}
              >
                <ChevronDown size={15} /> Expand group
              </button>
              <div className="vss-group-children" aria-label="Blocks in group">
                {selectedGroup.childNodeIds.map((nodeId) => {
                  const child = graph.nodes.find((node) => node.id === nodeId)
                  if (child === undefined) return null
                  return <button type="button" key={nodeId} onClick={() => setGroupExpanded(selectedGroup.id, true, nodeId)}><span>{child.kind}</span><strong>{child.title}</strong></button>
                })}
              </div>
            </>
          ) : selectedNode === undefined ? (
            <div className="vss-empty-inspector"><Box size={24} /><strong>Select a block</strong><span>Its properties and findings appear here.</span></div>
          ) : (
            <>
              <div className="vss-inspector-heading">
                <span className={`vss-inspector-icon vss-kind-${selectedNode.kind}`}><SelectedIcon size={18} /></span>
                <div><small>{selectedNode.kind}</small><h2>{selectedNode.title || 'Untitled block'}</h2></div>
              </div>

              <div className="vss-fields">
                <label>Title<input value={selectedNode.title} onChange={(event) => commitGraph(updateNode(graph, selectedNode.id, (node) => ({ ...node, title: event.target.value })))} /></label>
                <label>Kind<select value={selectedNode.kind} onChange={(event) => {
                  const kind = nodeKindSchema.parse(event.target.value)
                  commitGraph(updateNode(graph, selectedNode.id, (node) => ({ ...node, kind })))
                }}>{NODE_KINDS.map((kind) => <option value={kind} key={kind}>{kind}</option>)}</select></label>
                <div className="vss-detail-field">
                  <div className="vss-field-heading">
                    <label htmlFor={detailId}>Detail</label>
                    <div className="vss-field-actions">
                      <button
                        type="button"
                        ref={markdownPreviewButtonRef}
                        aria-label="MD preview"
                        title="MD preview"
                        aria-controls={markdownPreviewId}
                        aria-expanded={isMarkdownPreviewOpen}
                        onClick={() => setIsMarkdownPreviewOpen(true)}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="MD"
                        title="Open Markdown source"
                        onClick={() => onRevealSource?.(selectedNode.source)}
                      >
                        <FileText size={14} />
                      </button>
                    </div>
                  </div>
                  <textarea id={detailId} rows={4} value={selectedNode.detail} onChange={(event) => commitGraph(updateNode(graph, selectedNode.id, (node) => ({ ...node, detail: event.target.value })))} />
                </div>
                <label className="vss-confidence">Confidence <output>{Math.round(selectedNode.confidence * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={selectedNode.confidence} onChange={(event) => commitGraph(updateNode(graph, selectedNode.id, (node) => ({ ...node, confidence: event.target.valueAsNumber })))} /></label>
              </div>

              {selectedExpandedGroup !== undefined && (
                <button
                  type="button"
                  className="vss-group-action"
                  onClick={() => setGroupExpanded(selectedExpandedGroup.id, false, selectedExpandedGroup.id)}
                >
                  <ChevronUp size={15} /> Collapse {selectedExpandedGroup.childNodeIds.length} blocks
                </button>
              )}

              <button type="button" className="vss-source-link" onClick={() => onRevealSource?.(selectedNode.source)}>
                <Braces size={15} /><span><small>Source mapping</small><strong>{selectedNode.source.uri}:{selectedNode.source.start.line}</strong></span><ChevronRight size={15} />
              </button>

              <div className="vss-findings" aria-label="Findings">
                <h3>Findings <span>{indexedFindings.get(selectedNode.id)?.length ?? 0}</span></h3>
                {(indexedFindings.get(selectedNode.id) ?? []).map((finding) => (
                  <button type="button" className={`vss-finding vss-finding-${finding.severity}`} key={`${finding.ruleId}:${finding.message}`} onClick={() => finding.source !== undefined && onRevealSource?.(finding.source)}>
                    <AlertTriangle size={15} /><span><strong>{finding.message}</strong><small>{finding.ruleId}{finding.provenance === 'ai' ? ' · AI suggestion' : ''}</small></span>
                  </button>
                ))}
                {(indexedFindings.get(selectedNode.id)?.length ?? 0) === 0 && <p className="vss-clean"><CircleCheck size={16} /> No findings on this block</p>}
              </div>
            </>
          )}
        </aside>
      </div>

      <dialog
        id={markdownPreviewId}
        ref={markdownPreviewDialogRef}
        className="vss-markdown-dialog"
        aria-modal="true"
        aria-labelledby={markdownPreviewTitleId}
        onCancel={(event) => {
          event.preventDefault()
          setIsMarkdownPreviewOpen(false)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          setIsMarkdownPreviewOpen(false)
        }}
        onClose={() => {
          setIsMarkdownPreviewOpen(false)
          markdownPreviewButtonRef.current?.focus()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setIsMarkdownPreviewOpen(false)
        }}
      >
        <div className="vss-markdown-dialog-surface">
          <header className="vss-markdown-dialog-header">
            <div><small>Markdown preview</small><h2 id={markdownPreviewTitleId}>{selectedNode?.title || 'Untitled block'}</h2></div>
            <button
              type="button"
              ref={markdownPreviewCloseRef}
              className="vss-markdown-dialog-close"
              aria-label="Close Markdown preview"
              title="Close"
              onClick={() => setIsMarkdownPreviewOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <div className="vss-markdown-dialog-content">
            <MarkdownPreview markdown={selectedNode?.detail ?? ''} />
          </div>
        </div>
      </dialog>
    </section>
  )
}