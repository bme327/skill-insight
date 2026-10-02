---
name: preview-build
description: Build a package and start its local preview server
allowed-tools:
  - create_and_run_task
  - terminal_last_command
argument-hint: package name (optional)
---

# Preview build

When the user invokes `/preview-build`:

1. Resolve the requested package target from the argument.
2. Build the shared libraries and the selected package.
3. Start the local preview server with `create_and_run_task`.
4. Wait for the readiness signal on port 8181.
5. Report the preview URL to the user.

If the build fails, report the diagnostics from `terminal_last_command`.

See [the package guide](docs/packages.md) for the full list of packages.
