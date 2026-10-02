# Zoom, Pan, and Minimap

Plan for the *Zoom in/out* feature.

## 1. Intent

Large skill flows can extend beyond the visible canvas. Users need to see the complete
flow at a reduced scale, inspect details at a larger scale, and move between distant
parts of the graph without losing orientation.

**Goals**

- Zoom the graph in and out without changing graph data or layout coordinates.
- Fit the complete flow into the visible canvas.
- Pan with the existing scrollbars, wheel scrolling, or pointer drag on empty canvas.
- Show a minimap when the visible graph area is smaller than the complete layout.
- Keep node selection, editing, source navigation, and virtualization correct at every
  supported zoom level.
- Expose every zoom action through labelled keyboard-accessible controls.

**Non-goals**

- Replacing the deterministic graph layout engine.
- Persisting zoom or pan between graph sessions.
- Changing node dimensions or stored manual positions based on display scale.
- Introducing a third-party graph or canvas dependency.

## 2. Interaction

The graph opens at 100%. Controls provide zoom out, zoom in, and fit-to-view actions,
with the current percentage announced as status. Manual zoom is bounded between 25%
and 200%. Fit-to-view may use a smaller scale when a large flow cannot otherwise fit.
Holding Ctrl or Command while using the wheel zooms around the pointer position.
The high-contrast control group sits in a dedicated header at the top-right of the
canvas so it remains noticeable without covering graph content.

Dragging empty canvas pans the viewport. Dragging a node continues to move that node,
with pointer deltas converted back into unscaled graph coordinates.

Fit-to-view selects the largest supported scale at or below 100% that makes the entire
layout visible, then returns the viewport to the graph origin.

## 3. Minimap

The minimap appears in the bottom-right corner only when the current viewport does not
cover the full graph layout. It renders simplified node bounds and a viewport rectangle
from the existing `GraphLayout`.

Selecting a point on the minimap centers the main viewport at the corresponding graph
coordinate. Keyboard focus on the minimap supports arrow keys for viewport-sized
movement and Home/End for the graph corners. The minimap disappears after fit-to-view
when the complete layout is visible. While shown, the scroll surface reserves enough
right and bottom clearance to move boundary nodes away from the minimap.

## 4. Architecture

Zoom is presentation state owned by `SkillEditor`. Layout and persisted manual node
positions remain in graph coordinates.

```text
GraphLayout coordinates
  -> CSS scale for rendering
  -> scaled scroll surface
  -> graph-space Viewport for virtualization and minimap
```

Pure viewport helpers own zoom clamping, fit-scale calculation, scroll-to-graph
coordinate conversion, and minimap visibility. The React component owns DOM scrolling
and pointer interactions.

## 5. Testing

Unit tests cover zoom bounds, fit-to-view calculation, scaled viewport conversion, and
minimap visibility. Component coverage verifies the labelled zoom controls and minimap
surface. Browser coverage exercises zoom controls, fit-to-view, and minimap visibility
against the real canvas.

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| Zoom causes layout reflow | Calculate layout from physical canvas width, independently of scale |
| Dragging moves nodes too far while zoomed | Divide pointer movement by the active zoom |
| Virtualization hides visible nodes | Convert scroll offsets and client size into graph coordinates |
| Zoom jumps away from the area being inspected | Preserve the graph coordinate beneath the zoom anchor |
| Minimap disagrees with the canvas | Derive both node and viewport rectangles from `GraphLayout` and graph-space viewport |
