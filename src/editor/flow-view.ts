import type { EdgeKind, Finding, NodeKind, Severity, SkillGraph } from '../ir/index.js'

export type ViewLevel = 'overview' | 'grouped' | 'detail'
export type BuiltInFilterId = 'dangerous' | 'external' | 'findings'
export type AttachmentSize = 'small' | 'medium'
export type AttachmentPlacement = 'below' | 'right'

export interface FlowViewState {
  readonly level: ViewLevel
  readonly activeFilterIds: readonly string[]
  readonly groupExpansionOverrides: Readonly<Record<string, boolean>>
}

export interface FlowViewContext {
  readonly findings: readonly Finding[]
  readonly outsideWorkspaceReferenceNodeIds: readonly string[]
}

export interface FlowFilter {
  readonly id: string
  readonly label: string
  matches(graph: SkillGraph, nodeId: string, context: FlowViewContext): boolean
}

export interface SourceDisplayNode {
  readonly type: 'source'
  readonly id: string
  readonly sourceNodeId: string
  readonly groupId?: string
  readonly attachedToId?: string
  readonly attachmentSize?: AttachmentSize
  readonly attachmentPlacement?: AttachmentPlacement
  readonly contextOnly: boolean
}

export interface GroupDisplayNode {
  readonly type: 'group'
  readonly id: string
  readonly groupKind: NodeKind | 'references'
  readonly childNodeIds: readonly string[]
  readonly matchCount: number
  readonly findingCount: number
  readonly highestFindingSeverity?: Severity
  readonly attachedToId?: string
  readonly attachmentSize?: AttachmentSize
  readonly attachmentPlacement?: AttachmentPlacement
  readonly contextOnly: boolean
}

export type DisplayNode = SourceDisplayNode | GroupDisplayNode

export interface DisplayEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly kind: EdgeKind
  readonly label: string
  readonly sourceEdgeIds: readonly string[]
}

export interface FlowProjection {
  readonly nodes: readonly DisplayNode[]
  readonly edges: readonly DisplayEdge[]
  readonly groups: readonly FlowGroup[]
  readonly matchingSourceNodeCount: number
  readonly totalSourceNodeCount: number
}

export interface FlowGroup {
  readonly id: string
  readonly kind: NodeKind | 'references'
  readonly childNodeIds: readonly string[]
  readonly expanded: boolean
}

interface GroupCandidate {
  readonly id: string
  readonly kind: NodeKind | 'references'
  readonly childNodeIds: readonly string[]
  readonly defaultExpanded: boolean
}

const CONTROL_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set(['then', 'else', 'onError'])
const SEVERITY_RANK: Readonly<Record<Severity, number>> = { error: 0, warning: 1, info: 2 }
const ATTACHMENT_SIZE_BY_KIND: Partial<Readonly<Record<NodeKind, AttachmentSize>>> = {
  input: 'small',
  permission: 'small',
  validation: 'medium',
  errorPath: 'small',
  output: 'small',
  reference: 'small',
}
const ATTACHMENT_PLACEMENT_BY_KIND: Partial<Readonly<Record<NodeKind, AttachmentPlacement>>> = {
  input: 'below',
  permission: 'below',
  validation: 'below',
  errorPath: 'below',
  output: 'right',
  reference: 'below',
}
const BYPASSED_ATTACHMENT_KINDS: ReadonlySet<NodeKind> = new Set(['output', 'permission', 'validation'])

export const DEFAULT_FLOW_VIEW_STATE: FlowViewState = {
  level: 'overview',
  activeFilterIds: [],
  groupExpansionOverrides: {},
}

const dangerousFilter: FlowFilter = {
  id: 'dangerous',
  label: 'Dangerous',
  matches(_graph, nodeId, context) {
    return context.findings.some((finding) =>
      finding.nodeIds.includes(nodeId)
      && (finding.ruleId === 'permissions/destructive-action' || finding.ruleId.startsWith('security/')),
    )
  },
}

const externalFilter: FlowFilter = {
  id: 'external',
  label: 'External',
  matches(graph, nodeId, context) {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId)
    if (node === undefined) return false
    return node.capabilities.some((capability) => capability.kind === 'network')
      || (node.kind === 'reference' && context.outsideWorkspaceReferenceNodeIds.includes(nodeId))
  },
}

const findingsFilter: FlowFilter = {
  id: 'findings',
  label: 'Findings',
  matches(_graph, nodeId, context) {
    return context.findings.some((finding) => finding.nodeIds.includes(nodeId))
  },
}

export const builtInFlowFilters: readonly FlowFilter[] = [dangerousFilter, externalFilter, findingsFilter]

function groupId(kind: NodeKind | 'references', childNodeIds: readonly string[]): string {
  return `group:${kind}:${childNodeIds.join('|')}`
}

function controlDegrees(graph: SkillGraph): {
  readonly incoming: ReadonlyMap<string, number>
  readonly outgoing: ReadonlyMap<string, number>
} {
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(graph.nodes.map((node) => [node.id, 0]))
  for (const edge of graph.edges) {
    if (!CONTROL_EDGE_KINDS.has(edge.kind)) continue
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1)
  }
  return { incoming, outgoing }
}

function referenceGroups(graph: SkillGraph): readonly GroupCandidate[] {
  const referenceIds = new Set(graph.nodes.filter((node) => node.kind === 'reference').map((node) => node.id))
  const childrenByParent = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    if (!referenceIds.has(edge.to)) continue
    const children = childrenByParent.get(edge.from) ?? new Set<string>()
    children.add(edge.to)
    childrenByParent.set(edge.from, children)
  }

  const claimed = new Set<string>()
  const groups: GroupCandidate[] = []
  for (const [, children] of [...childrenByParent].sort(([left], [right]) => left.localeCompare(right))) {
    const childNodeIds = [...children].filter((id) => !claimed.has(id)).sort()
    if (childNodeIds.length < 2) continue
    childNodeIds.forEach((id) => claimed.add(id))
    groups.push({
      id: groupId('references', childNodeIds),
      kind: 'references',
      childNodeIds,
      defaultExpanded: true,
    })
  }
  return groups
}

function sameKindGroups(graph: SkillGraph, unavailableNodeIds: ReadonlySet<string>): readonly GroupCandidate[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const { incoming, outgoing } = controlDegrees(graph)
  const nextByNode = new Map<string, string>()
  const previousByNode = new Map<string, string>()

  for (const edge of graph.edges) {
    if (!CONTROL_EDGE_KINDS.has(edge.kind)) continue
    const from = nodesById.get(edge.from)
    const to = nodesById.get(edge.to)
    if (from === undefined || to === undefined || from.kind !== to.kind) continue
    if (unavailableNodeIds.has(from.id) || unavailableNodeIds.has(to.id)) continue
    if (outgoing.get(from.id) !== 1 || incoming.get(to.id) !== 1) continue
    nextByNode.set(from.id, to.id)
    previousByNode.set(to.id, from.id)
  }

  const groups: GroupCandidate[] = []
  const claimed = new Set<string>()
  for (const node of [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (claimed.has(node.id) || unavailableNodeIds.has(node.id) || previousByNode.has(node.id)) continue
    const childNodeIds: string[] = [node.id]
    let currentId = node.id
    const seen = new Set(childNodeIds)
    while (nextByNode.has(currentId)) {
      const nextId = nextByNode.get(currentId)
      if (nextId === undefined || seen.has(nextId)) break
      childNodeIds.push(nextId)
      seen.add(nextId)
      currentId = nextId
    }
    if (childNodeIds.length < 2) continue
    childNodeIds.forEach((id) => claimed.add(id))
    groups.push({
      id: groupId(node.kind, childNodeIds),
      kind: node.kind,
      childNodeIds,
      defaultExpanded: false,
    })
  }
  return groups
}

function groupCandidates(graph: SkillGraph): readonly GroupCandidate[] {
  const references = referenceGroups(graph)
  const parents = attachmentParents(graph)
  const unavailableNodeIds = new Set([
    ...references.flatMap((group) => group.childNodeIds),
    ...graph.nodes
      .filter((node) => parents.has(node.id) && node.kind !== 'reference')
      .map((node) => node.id),
  ])
  return [...references, ...sameKindGroups(graph, unavailableNodeIds)].sort((left, right) => left.id.localeCompare(right.id))
}

function attachmentParents(graph: SkillGraph): ReadonlyMap<string, string> {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const attachableNodeIds = new Set(graph.nodes.filter((node) => ATTACHMENT_SIZE_BY_KIND[node.kind] !== undefined).map((node) => node.id))
  const directParents = new Map<string, string>()
  for (const edge of [...graph.edges].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!attachableNodeIds.has(edge.to) || directParents.has(edge.to)) continue
    directParents.set(edge.to, edge.from)
  }

  for (const output of graph.nodes.filter((node) => node.kind === 'output')) {
    const visited = new Set([output.id])
    let currentId = output.id
    let producerId: string | undefined
    while (producerId === undefined) {
      const incoming = graph.edges.filter((edge) => edge.to === currentId && CONTROL_EDGE_KINDS.has(edge.kind))
      if (incoming.length !== 1) break
      const predecessorId = incoming[0]?.from
      const predecessor = predecessorId === undefined ? undefined : nodesById.get(predecessorId)
      if (predecessor === undefined || visited.has(predecessor.id)) break
      visited.add(predecessor.id)
      if (predecessor.kind === 'action' || predecessor.kind === 'toolCall') {
        producerId = predecessor.id
      } else if (predecessor.kind === 'output' || predecessor.kind === 'validation') {
        currentId = predecessor.id
      } else {
        break
      }
    }
    if (producerId === undefined) directParents.delete(output.id)
    else directParents.set(output.id, producerId)
  }

  const parents = new Map<string, string>()
  for (const nodeId of directParents.keys()) {
    const visited = new Set([nodeId])
    let parentId = directParents.get(nodeId)
    while (parentId !== undefined && directParents.has(parentId)) {
      if (visited.has(parentId)) {
        parentId = undefined
        break
      }
      visited.add(parentId)
      parentId = directParents.get(parentId)
    }
    if (parentId !== undefined) parents.set(nodeId, parentId)
  }
  return parents
}

function isGroupExpanded(group: GroupCandidate, state: FlowViewState): boolean {
  const override = state.groupExpansionOverrides[group.id]
  if (override !== undefined) return override
  if (state.level === 'detail') return true
  if (state.level === 'grouped' && group.kind === 'references') return true
  return group.defaultExpanded && state.level !== 'overview'
}

function matchingSourceNodeIds(
  graph: SkillGraph,
  state: FlowViewState,
  context: FlowViewContext,
  filters: readonly FlowFilter[],
): ReadonlySet<string> {
  if (state.activeFilterIds.length === 0) return new Set(graph.nodes.map((node) => node.id))
  const activeIds = new Set(state.activeFilterIds)
  const activeFilters = filters.filter((filter) => activeIds.has(filter.id))
  if (activeFilters.length === 0) return new Set(graph.nodes.map((node) => node.id))
  return new Set(graph.nodes
    .filter((node) => activeFilters.some((filter) => filter.matches(graph, node.id, context)))
    .map((node) => node.id))
}

function shortestPath(
  from: string,
  to: string,
  neighbors: ReadonlyMap<string, readonly string[]>,
): readonly string[] | undefined {
  const queue = [from]
  const visited = new Set([from])
  const previous = new Map<string, string>()
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    if (current === undefined) break
    if (current === to) break
    for (const next of neighbors.get(current) ?? []) {
      if (visited.has(next)) continue
      visited.add(next)
      previous.set(next, current)
      queue.push(next)
    }
  }
  if (!visited.has(to)) return undefined
  const path = [to]
  while (path[0] !== from) {
    const head = path[0]
    if (head === undefined) return undefined
    const prior = previous.get(head)
    if (prior === undefined) return undefined
    path.unshift(prior)
  }
  return path
}

function contextSourceNodeIds(graph: SkillGraph, matches: ReadonlySet<string>): ReadonlySet<string> {
  if (matches.size < 2) return new Set()
  const neighbors = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (!CONTROL_EDGE_KINDS.has(edge.kind)) continue
    const targets = neighbors.get(edge.from) ?? []
    targets.push(edge.to)
    neighbors.set(edge.from, targets)
  }
  for (const targets of neighbors.values()) targets.sort()

  const context = new Set<string>()
  const orderedMatches = [...matches].sort()
  for (const from of orderedMatches) {
    for (const to of orderedMatches) {
      if (from === to) continue
      const path = shortestPath(from, to, neighbors)
      path?.forEach((nodeId) => {
        if (!matches.has(nodeId)) context.add(nodeId)
      })
    }
  }
  return context
}

function groupFindings(group: { readonly childNodeIds: readonly string[] }, findings: readonly Finding[]): readonly Finding[] {
  const childIds = new Set(group.childNodeIds)
  return findings.filter((finding) => finding.nodeIds.some((nodeId) => childIds.has(nodeId)))
}

function highestSeverity(findings: readonly Finding[]): Severity | undefined {
  return findings
    .map((finding) => finding.severity)
    .sort((left, right) => SEVERITY_RANK[left] - SEVERITY_RANK[right])[0]
}

function projectNodes(
  graph: SkillGraph,
  state: FlowViewState,
  context: FlowViewContext,
  matches: ReadonlySet<string>,
  contextIds: ReadonlySet<string>,
  groups: readonly FlowGroup[],
): {
  readonly nodes: readonly DisplayNode[]
  readonly displayIdBySourceId: ReadonlyMap<string, string>
  readonly attachedSourceNodeIds: ReadonlySet<string>
} {
  const included = state.activeFilterIds.length === 0
    ? new Set(graph.nodes.map((node) => node.id))
    : new Set([...matches, ...contextIds])
  const nodes: DisplayNode[] = []
  const displayIdBySourceId = new Map<string, string>()
  const groupedNodeIds = new Set<string>()

  for (const group of groups) {
    if (group.expanded) continue
    group.childNodeIds.forEach((nodeId) => groupedNodeIds.add(nodeId))
    const visibleChildren = group.childNodeIds.filter((nodeId) => included.has(nodeId))
    if (visibleChildren.length === 0) continue
    const findings = groupFindings(group, context.findings)
    const matchCount = group.childNodeIds.filter((nodeId) => matches.has(nodeId)).length
    const severity = highestSeverity(findings)
    nodes.push({
      type: 'group',
      id: group.id,
      groupKind: group.kind,
      childNodeIds: group.childNodeIds,
      matchCount: state.activeFilterIds.length === 0 ? 0 : matchCount,
      findingCount: findings.length,
      ...(severity === undefined ? {} : { highestFindingSeverity: severity }),
      contextOnly: matchCount === 0,
    })
    visibleChildren.forEach((nodeId) => displayIdBySourceId.set(nodeId, group.id))
  }

  for (const node of graph.nodes) {
    if (groupedNodeIds.has(node.id) || !included.has(node.id)) continue
    const group = groups.find((candidate) => candidate.expanded && candidate.childNodeIds.includes(node.id))
    nodes.push({
      type: 'source',
      id: node.id,
      sourceNodeId: node.id,
      ...(group === undefined ? {} : { groupId: group.id }),
      contextOnly: contextIds.has(node.id) && !matches.has(node.id),
    })
    displayIdBySourceId.set(node.id, node.id)
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const parentBySourceNodeId = attachmentParents(graph)
  const attachedSourceNodeIds = new Set<string>()
  const attachedNodes = nodes.map((displayNode): DisplayNode => {
    const sourceNodeIds = displayNode.type === 'source' ? [displayNode.sourceNodeId] : displayNode.childNodeIds
    const sourceNodes = sourceNodeIds.flatMap((nodeId) => {
      const node = nodesById.get(nodeId)
      return node === undefined ? [] : [node]
    })
    const sizes = new Set(sourceNodes.map((node) => ATTACHMENT_SIZE_BY_KIND[node.kind]).filter((size) => size !== undefined))
    const placements = new Set(sourceNodes.map((node) => ATTACHMENT_PLACEMENT_BY_KIND[node.kind]).filter((placement) => placement !== undefined))
    const parentSourceIds = new Set(sourceNodeIds.map((nodeId) => parentBySourceNodeId.get(nodeId)).filter((id) => id !== undefined))
    if (sizes.size !== 1 || placements.size !== 1 || parentSourceIds.size !== 1) return displayNode
    const size = [...sizes][0]
    const placement = [...placements][0]
    const parentSourceId = [...parentSourceIds][0]
    if (size === undefined || placement === undefined || parentSourceId === undefined) return displayNode
    const attachedToId = displayIdBySourceId.get(parentSourceId)
    if (attachedToId === undefined || attachedToId === displayNode.id) return displayNode
    sourceNodeIds.forEach((nodeId) => attachedSourceNodeIds.add(nodeId))
    return { ...displayNode, attachedToId, attachmentSize: size, attachmentPlacement: placement }
  })

  return {
    nodes: attachedNodes.sort((left, right) => left.id.localeCompare(right.id)),
    displayIdBySourceId,
    attachedSourceNodeIds,
  }
}

function projectEdges(
  graph: SkillGraph,
  displayIdBySourceId: ReadonlyMap<string, string>,
  attachedSourceNodeIds: ReadonlySet<string>,
): readonly DisplayEdge[] {
  const projected = new Map<string, { from: string; to: string; kind: EdgeKind; label: string; sourceEdgeIds: string[] }>()

  const addEdge = (fromSourceId: string, toSourceId: string, kind: EdgeKind, label: string, sourceEdgeIds: readonly string[]): void => {
    const from = displayIdBySourceId.get(fromSourceId)
    const to = displayIdBySourceId.get(toSourceId)
    if (from === undefined || to === undefined || from === to) return
    const key = `${from}\u0000${to}\u0000${kind}`
    const current = projected.get(key)
    if (current === undefined) {
      projected.set(key, { from, to, kind, label, sourceEdgeIds: [...sourceEdgeIds] })
    } else {
      current.sourceEdgeIds.push(...sourceEdgeIds)
      if (label.localeCompare(current.label) < 0) current.label = label
    }
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const outgoingByNodeId = new Map<string, typeof graph.edges>()
  for (const edge of graph.edges) {
    const outgoing = outgoingByNodeId.get(edge.from) ?? []
    outgoingByNodeId.set(edge.from, [...outgoing, edge])
  }

  const traverse = (
    sourceId: string,
    edge: (typeof graph.edges)[number],
    sourceEdgeIds: readonly string[],
    visited: ReadonlySet<string>,
  ): void => {
    if (!attachedSourceNodeIds.has(edge.to)) {
      addEdge(sourceId, edge.to, edge.kind, edge.label, sourceEdgeIds)
      return
    }
    const target = nodesById.get(edge.to)
    if (target === undefined || !BYPASSED_ATTACHMENT_KINDS.has(target.kind) || visited.has(target.id)) return
    const nextVisited = new Set(visited)
    nextVisited.add(target.id)
    for (const next of outgoingByNodeId.get(target.id) ?? []) {
      traverse(sourceId, next, [...sourceEdgeIds, next.id], nextVisited)
    }
  }

  for (const source of graph.nodes) {
    if (attachedSourceNodeIds.has(source.id)) continue
    for (const edge of outgoingByNodeId.get(source.id) ?? []) {
      traverse(source.id, edge, [edge.id], new Set())
    }
  }

  return [...projected.values()]
    .map((edge) => ({
      id: `view-edge:${edge.kind}:${edge.from}->${edge.to}`,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      label: edge.label,
      sourceEdgeIds: edge.sourceEdgeIds.sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function projectFlowView(
  graph: SkillGraph,
  state: FlowViewState,
  context: FlowViewContext,
  filters: readonly FlowFilter[],
): FlowProjection {
  const knownFilterIds = new Set(filters.map((filter) => filter.id))
  const effectiveState: FlowViewState = {
    ...state,
    activeFilterIds: state.activeFilterIds.filter((filterId) => knownFilterIds.has(filterId)),
  }
  const matches = matchingSourceNodeIds(graph, effectiveState, context, filters)
  const contextIds = effectiveState.activeFilterIds.length === 0 ? new Set<string>() : contextSourceNodeIds(graph, matches)
  const groups = groupCandidates(graph).map((group) => ({
    id: group.id,
    kind: group.kind,
    childNodeIds: group.childNodeIds,
    expanded: isGroupExpanded(group, effectiveState),
  }))
  const { nodes, displayIdBySourceId, attachedSourceNodeIds } = projectNodes(
    graph,
    effectiveState,
    context,
    matches,
    contextIds,
    groups,
  )
  return {
    nodes,
    edges: projectEdges(graph, displayIdBySourceId, attachedSourceNodeIds),
    groups,
    matchingSourceNodeCount: effectiveState.activeFilterIds.length === 0 ? graph.nodes.length : matches.size,
    totalSourceNodeCount: graph.nodes.length,
  }
}