---
name: release-notes
description: Draft release notes from merged pull requests
allowed-tools:
  - github_search
---

# Release notes

1. Collect merged pull requests since the last tag.
2. If the tag is missing, use the repository creation date.
3. Otherwise use the tag date as the lower bound.
4. Group the pull requests by label using `github_search`.
5. Return the drafted notes.

If grouping fails, report the raw list instead.
