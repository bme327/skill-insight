# Workspace-Only Skill Discovery

Plan for the *Allow workspace-only skill discovery* feature.

**Status: implemented.** Skill Insights can exclude personal skill locations so a
workspace can be inspected without unrelated entries from the user's profile.

## 1. Intent

Skill discovery currently combines the open workspace with built-in and configured
personal roots. Large personal catalogs can overwhelm a small repository and add
unnecessary scanning and watching.

**Goals**

- Preserve workspace-plus-personal discovery as the default.
- Add a workspace setting that disables all personal discovery roots.
- Apply setting changes without restarting VS Code.
- Keep scan progress, catalog groups, and watchers aligned with the selected mode.
- Cover both modes with automated tests.

**Non-goals**

- Changing which file names qualify as skills.
- Adding per-personal-root toggles.
- Removing explicitly opened supported files from the catalog.
- Building a custom settings editor outside VS Code Settings.

## 2. Behavior

`skillInsights.includePersonalSkills` is a window-scoped boolean setting that
defaults to `true`. When enabled, discovery includes the existing built-in roots and
all paths from `skillInsights.personalSkillLocations`.

When disabled, personal roots resolve to an empty set. The discovery service therefore
does not traverse them, include their files in progress totals or catalog groups, or
create filesystem watchers for them. Workspace files and explicitly opened supported
files remain available.

Changing either the personal-discovery setting or the configured personal locations
rebuilds personal watchers and schedules a catalog refresh. A VS Code restart is not
required.

## 3. Validation

- Unit tests verify that personal discovery remains enabled by default and is disabled
  only when the setting is explicitly false.
- Existing checks cover type safety, linting, builds, and regressions in catalog and
  extension behavior.

## 4. Risks

- Existing users could lose expected personal entries if the default changed. The
  default remains enabled.
- Disabled personal roots could continue generating refreshes if old watchers were
  retained. Watchers are disposed before the enabled root set is recreated.
- Configured personal paths could accidentally bypass workspace-only mode. The mode is
  checked before built-in or configured roots are constructed.
