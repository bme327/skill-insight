# Collapsible Skill Panel

Plan for the *Skill panel should be collapsible* feature.

**Status: implemented.** The graph view's embedded skill catalog can be collapsed to
give the canvas more space and expanded again without losing the current filter or
selection.

## 1. Intent

The embedded skill catalog permanently reserves part of the graph view even after the
user has selected a skill. The catalog remains useful for discovery and search, but it
should not reduce the working canvas when it is not needed.

**Goals**

- Let the user collapse and expand the embedded skill catalog.
- Preserve the existing skill filter and selection behavior.
- Provide a compact top search for navigating directly to a skill.
- Return the selected skill to view when the catalog is reopened.
- Keep the control accessible by keyboard and assistive technology.
- Remain usable when the graph view is narrow.

**Non-goals**

- Changing workspace or personal skill discovery.
- Adding fuzzy search or a new search index.
- Changing the separate Activity Bar skill catalog.
- Persisting the collapsed state between graph sessions.

## 2. Behavior

The catalog opens expanded to preserve the existing experience. Its header contains a
toggle labelled `Collapse skills panel`. Collapsing hides the catalog contents and
reduces it to a 36-pixel rail containing an `Expand skills panel` control.

The component remains mounted while collapsed, so its filter text and selected skill
are retained. Expanding the panel scrolls the selected skill back into view.

Search continues to use the existing case-insensitive match across each skill's name,
description, and path. Selecting a result uses the existing host message; collapsing
does not change discovery or selection contracts.

A compact search box remains available in the Skill Insights toolbar when the
catalog is collapsed. It is placed between the current skill name and the toolbar
actions. It matches skill names and ranks prefix matches first. Suggestions that
contain the query follow prefix matches, and the matching substring is highlighted in
each result in the same style as VS Code's quick navigation. All matches remain
available in a bounded, scrollable result list rather than being truncated. Pressing
Enter selects the active suggestion; the arrow keys move through suggestions and
scroll the active item into view, and a suggestion can also be selected with the mouse.
Navigation reuses the existing `selectSkill` host message.

## 3. Responsive Layout

On a normal-width graph view, the catalog occupies a 230-pixel column and collapses to
a 36-pixel column. Below 620 pixels, the graph view stacks vertically: the expanded
catalog occupies the top region and the collapsed catalog becomes a 36-pixel row.

The toggle uses the standard VS Code focus border and toolbar hover colors. Its visible
glyph is decorative; the accessible name communicates the action.

## 4. Implementation

`GraphCatalog` owns catalog presentation, filtering, scan status, selection rendering,
and the collapse control. `SkillSearch` owns the compact name-based typeahead.
`webview.tsx` owns the session-local collapsed state and continues to own host
communication.

```text
webview.tsx
  -> GraphCatalog.tsx
       -> existing SkillCatalogGroup data
       -> existing filter and selection callbacks
  -> SkillSearch.tsx
       -> existing SkillCatalogGroup data
       -> existing selection callback
```

No `SkillGraph` intermediate-representation, parser, validation, discovery, or message
schema changes are required.

## 5. Testing

Component tests cover:

- the expanded catalog showing search, skills, and the collapse control;
- the collapsed catalog showing only the accessible expand control;
- the catalog content being absent while collapsed;
- name-based typeahead matching, prefix ordering, and highlighted substrings;
- toolbar placement between the current skill name and actions; and
- accessible combobox markup for direct skill navigation.

The browser journey types a query, changes the active option with the arrow keys,
presses Enter, and verifies that the selected skill graph opens. Manual verification
uses the VS Code Extension Development Host with a workspace that contains multiple
skills, including a narrow graph-panel layout.

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| A selected skill is off-screen after expansion | Scroll the selected entry into view when collapsed state changes |
| The narrow layout leaves too little graph space or clips the toggle | Replace the desktop column with a compact top row below 620 pixels and reduce collapsed padding to fit its control |
| A glyph-only control is unclear to assistive technology | Provide action-specific `aria-label` and `title` values |
| The feature changes discovery or selection behavior | Reuse the existing groups, query, and selection callbacks unchanged |
