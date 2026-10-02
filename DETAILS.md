# Skill Insights

**See what your AI skills actually do.**

Skill Insights reads the skill definitions in your workspace and turns each one into
an inspectable flow: the trigger that starts it, the decisions it branches on, the
tools it calls, the permissions it claims, and the outputs it produces — all mapped
back to the exact lines of the file that define them.

![Switching detail levels and filters in the Skill Insights flow view](media/demo.gif)

Problems are reported where you can act on them — here a prompt-injection pattern
caught in a skill's instructions:

![A prompt-injection finding on a skill block](media/findings.png)

## What you get

- **A skill catalog in the Activity Bar.** Every skill in the workspace, grouped by
  the folder it came from, with a search box to jump straight to one.
- **A flow view next to the source.** Open any skill file and render it as a graph.
  Click a block to reveal the line that produced it; select in the editor to
  highlight the matching block.
- **Three levels of detail.** Collapse a long procedure into an overview, group
  related steps, or expand every instruction. Filter to only dangerous operations,
  external calls, or blocks that carry findings.
- **Problems you can act on.** Undeclared tools, unresolvable file references,
  path traversal, and prompt-injection patterns are reported in the Problems panel
  like any other diagnostic.
- **An optional AI review.** Ask a language model for a deeper assessment of the
  open skill. Nothing is sent until you explicitly ask, and secrets are redacted
  from the content first.
- **Chat commands.** Use `@skillInsights` in Chat with `/explain`, `/validate`,
  `/fix`, or `/skillinsights-review`.

## Getting started

1. Open a workspace that contains skill definitions.
2. Click the **Skill Insights** icon in the Activity Bar.
3. Pick a skill to render it, or run **Skill Insights: Open Skill Graph** from the
   Command Palette on an open skill file.

## Settings

| Setting | What it does |
| --- | --- |
| `skillInsights.includePersonalSkills` | Also discover skills outside the workspace. Off by default. |
| `skillInsights.personalSkillLocations` | Extra folders to scan when personal skills are enabled. |
| `skillInsights.aiAssessment.enabled` | Turn the AI assessment feature on or off. |
| `skillInsights.aiAssessment.model` | Which language model to use for the assessment. |

## Privacy

Analysis runs entirely on your machine. Skill content leaves the machine only when
you explicitly trigger an AI assessment or a chat command, and only after secrets
have been redacted. No telemetry carries skill content.
