---
name: complex-release-review
description: Review a release candidate across source, tests, security, packaging, and deployment
allowed-tools:
  - github_search
  - create_and_run_task
  - terminal_last_command
argument-hint: base ref and release channel
---

# Complex release review

When the user invokes `/release-review`, inspect the release candidate before approval.

Inputs are `$BASE_REF`, `$HEAD_SHA`, and `$RELEASE_CHANNEL`.

## Establish scope

1. Resolve the comparison range from `$BASE_REF` to `$HEAD_SHA`.
2. Use `github_search` to collect pull requests included in the range.
3. Group changes by runtime, user interface, build, documentation, and infrastructure.
4. Identify generated files and exclude them from manual style findings.
5. Record owners for every affected subsystem.
6. If the comparison range is empty, report that no release review is required.

## Review implementation

1. Inspect public API changes for compatibility.
2. Check state transitions for race conditions and stale updates.
3. Check asynchronous work for cancellation and cleanup.
4. Check file operations for normalized paths and allowed roots.
5. Check rendered content for unsafe HTML and scriptable links.
6. Check webview messages against their validated schemas.
7. Verify every new branch has a reachable error path.
8. Verify every external operation declares its permission.
9. Compare user-facing behavior with [the review policy](docs/review-policy.md).
10. Record external services such as https://status.example.com/releases.

## Build and test

1. Use `create_and_run_task` to run the lint task.
2. Use `create_and_run_task` to run strict typechecking.
3. Use `create_and_run_task` to build the extension and web application.
4. Use `create_and_run_task` to run focused unit tests.
5. Use `create_and_run_task` to run the full test suite.
6. Validate the production bundle contains no unexpected remote origins.
7. Confirm the complex graph opens in Overview, Grouped, and Detail views.
8. Confirm Dangerous, External, and Findings filters combine correctly.
9. Confirm source navigation selects the expected source span.
10. If a task fails, collect diagnostics with `terminal_last_command` and stop approval.

## Release decision

1. If a blocking security finding exists, reject the release.
2. If required tests are missing, request coverage before approval.
3. If deployment configuration changed, require an operations review.
4. Otherwise summarize residual risks and approve the candidate.
5. Report findings ordered by severity and source location.
6. Return the final decision with links to supporting evidence.

## Markdown report template

Render this template in the Markdown preview:

```markdown
## Release review summary

The candidate is **ready for review** with `npm run check` as the required gate.

> Block approval when any required gate fails.

| Gate | Owner | Result |
| --- | --- | --- |
| Lint and types | Engineering | Pass |
| Security review | Security | Pending |
| Deployment plan | Operations | Pass |

- [x] Source reviewed
- [x] Tests executed
- [ ] Security sign-off recorded

See [release evidence](https://example.com/releases/evidence) and remove ~~obsolete exceptions~~.
```

If the report cannot be rendered, return the same information as plain text.