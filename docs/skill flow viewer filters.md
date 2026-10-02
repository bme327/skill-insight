# Skill Flow Viewer: Grouping and Filters

## Status

Implemented product behavior and editor-layer contracts. This feature does not change
the `SkillGraph` intermediate representation.

## Problem

The skill viewer renders every parsed block on first open. Detailed graphs are hard to
scan, and safety-relevant or externally communicating behavior can be lost among
routine instructions and references.

The viewer needs a deterministic presentation layer that can:

- move between overview, grouped, and full-detail views;
- collapse related blocks without changing the underlying graph;
- filter for findings, safety-relevant behavior, and external behavior;
- combine filters predictably; and
- preserve enough flow context to explain how matching blocks are reached.

## Goals

1. Make the first view of a large skill understandable without manual rearrangement.
2. Let users reveal detail progressively and expand individual groups.
3. Let users find potentially dangerous actions and external communication or sources.
4. Keep selection, findings, and source navigation attached to original graph nodes.
5. Keep grouping and filtering provider-neutral and extensible.

## Non-goals

- Changing parser output or adding presentation-only nodes to `SkillGraph`.
- Inferring risk directly in React components.
- Persisting view preferences into skill source files or exported graphs.
- Defining new validation rules. Filters consume normalized graph data and findings.
- Supporting arbitrary user-authored filter expressions in the first release.

## Terminology

- **Source node:** an original node in `SkillGraph.nodes`.
- **Display node:** a source node or a temporary group shown by the viewer.
- **Flow segment:** a maximal sequence of source nodes on one branch. A segment ends at
	a branch, merge, or a change of node kind.
- **Reference siblings:** reference nodes with the same direct incoming source node.
- **Context node:** a nonmatching source node retained to connect matching nodes.
- **View level:** one of the three predefined detail levels below.

## View Levels

The toolbar exposes a three-option segmented control. A skill opens at **Overview**
unless a locally persisted preference exists.

| Level | Same-kind flow segments | Reference siblings |
| --- | --- | --- |
| Overview | Collapsed | Collapsed |
| Grouped | Collapsed | Expanded |
| Detail | Expanded | Expanded |

Changing the level establishes the default expansion state for all groups. The user
may then expand or collapse an individual group without changing the selected level.
Changing to another level clears those per-group overrides. Each override records the
desired expanded state and therefore cannot express conflicting states for one group.

## Grouping Rules

### Same-kind flow groups

Two or more source nodes form a group when all of the following are true:

1. They have the same `kind`.
2. They are consecutive through control-flow edges (`then`, `else`, or `onError`).
3. Each interior node has exactly one in-segment predecessor and one in-segment
	 successor.
4. The sequence does not cross a branch or merge.

`dataFlow` edges do not establish or break a flow segment. A single node never becomes
a group. Group IDs are derived deterministically from the group kind and ordered child
IDs so expansion state remains stable across rerenders.

### Reference groups

Two or more `reference` nodes form a reference group when they share the same direct
incoming source node. References with different parents are never grouped together.
All incoming edge kinds participate because a reference may describe control or data
flow.

Reference grouping takes precedence over same-kind flow grouping. A source node may
belong to at most one display group.

### Group presentation

A collapsed group displays:

- its group kind and a concise generated label;
- total child count;
- count and highest severity of findings on its children;
- active-filter match count when filters are applied; and
- an expand control.

Selecting a collapsed group opens a group summary in the inspector. Expanding it
replaces the group display node with its source display nodes; the projection never
contains both at once. Selecting a child preserves existing source navigation and editing
behavior. Edges entering or leaving hidden children are projected onto the group, and
duplicate projected edges are rendered once.

### Attached supporting nodes

Supporting nodes do not consume a full graph layer when they can be associated with a
stable full-size parent. They render as selectable compact attachments:

- `input`, `permission`, `errorPath`, and `reference` use the small attachment size;
- `validation` uses the medium attachment size; and
- `output` uses the small attachment size and renders to the right of its nearest
	preceding `action` or `toolCall`, including through validation/output runs; and
- sibling references collapsed in Overview attach as one small reference group.

All other attachments render beneath their parent. If an attachment's direct parent is
also attached, both are flattened onto the nearest full-size parent to avoid nested
layout. Outputs without an unambiguous preceding action or tool call remain standalone.

The attachment edge is implied by placement and is not drawn. If an attached permission
validation, or output run continues the main flow, the projection bypasses the complete
run with an edge from its predecessor to its successor. This changes presentation only;
the source graph and its original edges remain unchanged.

Hovering or keyboard-focusing an attachment shows a summary tooltip. Activating it opens
that source node's normal details in the inspector. Attachments cannot be dragged away
from their parent. If the parent is filtered out, the supporting node falls back to a
normal standalone display node.

## Filters

Filters are independent toggle controls and combine using **OR** semantics. With no
active filters, all display nodes allowed by the current view level are shown. With
active filters, a source node matches when any active filter matches it.

The viewer provides these filters:

### Dangerous

Matches every source node whose ID occurs in `finding.nodeIds` for a finding from an
explicit allowlist of safety rules. Initially:

- `permissions/destructive-action`
- every `security/*` rule

Ordinary process, file, secret, and tool capabilities do not match solely because of
their capability kind. New validation rules must opt into this filter deliberately.

### External

Matches a node when either condition is true:

- it has a `network` capability; or
- it is a reference whose validated, normalized target resolves outside the active
	workspace root.

References to another file inside the workspace do not match. Unresolved references
do not match merely because resolution failed; their validation finding remains visible
through the normal findings UI.

### Findings

Matches every source node whose ID occurs in any `finding.nodeIds`, regardless of rule
or severity. Findings without an associated node remain available through the normal
findings UI but cannot produce a graph match.

### Filtered graph behavior

Nonmatching nodes are hidden except for the minimum context needed to connect matching
nodes. For each ordered pair of matches connected by control flow, context is taken from
the shortest directed path by edge count; ties are resolved by node ID. A single match
needs no context. Matches with no directed path between them remain disconnected.
Context nodes are visually subdued and identified as context in their accessible name.
`dataFlow` edges do not participate in path calculation or add context nodes.

If a collapsed group contains at least one matching child, the group remains collapsed
and visible with `matching / total` counts. It does not auto-expand. A group containing
only context children is shown as context. A group with neither matches nor required
context is hidden.

When matches are disconnected, each matching component remains visible; the viewer
does not invent an edge between components. An empty result shows a clear empty state
and a control to clear all filters.

## Editor-layer Contracts

Grouping and filtering are pure projections owned by `src/editor`. They accept the
current graph and findings and return display data. They never mutate the graph or
write presentation data to `graph.raw`.

```ts
import type { EdgeKind, Finding, NodeKind, SkillGraph } from '../ir/index.js'

export type ViewLevel = 'overview' | 'grouped' | 'detail'
export type BuiltInFilterId = 'dangerous' | 'external' | 'findings'
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
	readonly attachmentSize?: 'small' | 'medium'
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
	readonly highestFindingSeverity?: 'error' | 'warning' | 'info'
	readonly attachedToId?: string
	readonly attachmentSize?: 'small' | 'medium'
	readonly attachmentPlacement?: AttachmentPlacement
	readonly contextOnly: boolean
}

export type DisplayNode = SourceDisplayNode | GroupDisplayNode

export interface FlowGroup {
	readonly id: string
	readonly kind: NodeKind | 'references'
	readonly childNodeIds: readonly string[]
	readonly expanded: boolean
}

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

export function projectFlowView(
	graph: SkillGraph,
	state: FlowViewState,
	context: FlowViewContext,
	filters: readonly FlowFilter[],
): FlowProjection
```

The filter registry is injected rather than mutated at module load. Unknown persisted
filter IDs are ignored, allowing filters to be removed without breaking the viewer.
Inputs and outputs use readonly types; equal inputs must produce structurally equal,
deterministically ordered output. The host supplies outside-workspace reference IDs only
after resolving targets against an explicit allowed root; the editor never resolves an
untrusted path or guesses from reference text.

## State and Persistence

View state is stored locally per skill, keyed by a stable skill identity. It is not part
of editor undo/redo and is never emitted to source. Persist:

- selected view level;
- active filter IDs; and
- group expansion overrides as one group-ID-to-expanded-state map.

Selection is not persisted. Stale group IDs and unknown filter IDs are discarded when
state is restored. If local persistence is unavailable, state lasts for the editor
session only.

## Interaction and Accessibility

- The level control is a keyboard-operable segmented control with one selected value.
- Filters are toggle controls that announce pressed state and result count.
- Group controls announce label, child count, match count, finding count, and expansion
	state.
- Expanding a group moves focus to its first visible child; collapsing it returns focus
	to the group control.
- If the selected source node becomes hidden, selection moves to its containing group;
	otherwise it moves to the canvas without automatically clearing filters.
- Color is not the only indicator for matches, context, findings, or expansion state.
- Edges expose a wider pointer hit area than their visible stroke, highlight on hover,
	and end with a light directional arrow at the target node.
- Forward edges connect right-to-left. Wrapped edges connect bottom-to-top, while
	reverse/upward geometry connects top-to-bottom so paths do not cross node interiors.

## Performance

Projection must be a pure operation suitable for memoization by the caller. Grouping and
edge projection should run in $O(V + E)$ time apart from deterministic sorting. Filter
context may run one graph search per match. The viewer lays out only the projected graph
and continues to virtualize off-screen display nodes.

## Acceptance Criteria

1. A graph with one linear run of three `action` nodes renders one collapsed group in
	 Overview and Grouped, and three source nodes in Detail.
2. Same-kind nodes separated by a branch or merge are not placed in one flow group.
3. Three references with one direct parent render as one group in Overview and as three
	 nodes in Grouped and Detail.
4. References with different direct parents never share a group.
5. Activating Dangerous, External, and Findings shows the union of all match sets.
6. A collapsed group containing one match stays collapsed and reports `1 / n` matches.
7. Filtering retains only shortest control-flow paths needed to connect matches; retained
	 nonmatches are identified as context.
8. The Dangerous filter matches destructive-action and security findings but does not
	 match an ordinary declared tool call.
9. The External filter matches network access and references outside the workspace, but
	 not references to files inside the workspace.
10. The Findings filter matches every node associated with a finding and excludes clean
	 nodes unless another active filter matches them.
11. Grouping, filtering, and edge projection leave the input `SkillGraph` unchanged.
12. Projected nodes and edges have deterministic IDs and order for equal inputs.
13. Reloading a skill restores its local view level, filters, and valid group overrides
		without changing the skill file.
14. Input, permission, error-path, validation, and reference nodes with direct parents
		render beneath those parents without consuming independent graph layers; validation
		attachments are larger than the other attachment kinds.
15. Outputs with an unambiguous preceding action or tool call render as compact right-side
	 attachments, and transitive compact runs preserve the surrounding visible flow.
16. Every attachment exposes its summary on hover and keyboard focus, and activation
		selects the original source node in the inspector.
17. Hovering an edge highlights it, and every edge ends with a visible arrow at its target.

## Test Expectations

- Unit-test each grouping boundary: linear run, branch, merge, singleton, and mixed kind.
- Unit-test reference grouping with same and different parents.
- Unit-test each built-in filter for matching, clean, and near-miss cases.
- Unit-test OR combination, shortest-path context, disconnected matches, and empty results.
- Unit-test projected edge deduplication and stable IDs.
- Unit-test attachment ownership, permission/validation bypass edges, compact dimensions,
	and sibling reference-group attachment.
- Add component tests for level changes, filter toggles, group expansion, focus retention,
	selection fallback, attachment tooltips, inspector selection, and accessible names.
- Add a Playwright flow covering a large graph from Overview through filtering and
	expansion, using accessible role and name selectors.