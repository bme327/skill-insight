import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/**
 * Node rendering is viewport-virtualised (`visibleNodeIds` in src/editor/viewport.ts),
 * so a small window silently drops blocks from the DOM. This window is large enough for
 * the small samples, but NOT for `complex`, which still virtualises here. Never assert an
 * exhaustive block set on `complex`; assert the projection-derived tally instead.
 */
export const wideViewport = { width: 1920, height: 1400 } as const

export const sampleLabels = {
  complex: 'Complex release review',
  previewBuild: 'Preview build',
  injection: 'Prompt injection',
  traversal: 'Path traversal',
} as const

export const graphNames = {
  complex: 'complex-release-review',
  previewBuild: 'preview-build',
  injection: 'summarize-repo',
  traversal: 'collect-config',
} as const

export type SampleLabel = (typeof sampleLabels)[keyof typeof sampleLabels]

/** Every block button, including the collapsed-group buttons, which are blocks too. */
export function blocks(page: Page): Locator {
  return page.getByRole('button', { name: /^Inspect / })
}

export function block(page: Page, name: string): Locator {
  return page.getByRole('button', { name: `Inspect ${name}`, exact: true })
}

export function editorRegion(page: Page, graphName: string): Locator {
  return page.getByRole('region', { name: `Visual editor for ${graphName}` })
}

export function inspector(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Block inspector' })
}

export function undoButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Undo', exact: true })
}

export function redoButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Redo', exact: true })
}

/**
 * The Confidence label wraps both an `<output>` and the range input, and `<output>` is
 * labelable, so `getByLabel('Confidence')` resolves to the output rather than the slider.
 * Address the two controls by role instead.
 */
export function confidenceSlider(page: Page): Locator {
  return inspector(page).getByRole('slider')
}

export function confidenceOutput(page: Page): Locator {
  return inspector(page).getByRole('status')
}

export function levelButton(page: Page, label: 'Overview' | 'Grouped' | 'Detail'): Locator {
  return page.getByRole('group', { name: 'Graph detail level' }).getByRole('button', { name: label, exact: true })
}

export function filterButton(page: Page, label: 'Dangerous' | 'External' | 'Findings'): Locator {
  return page.getByRole('group', { name: 'Graph filters' }).getByRole('button', { name: label, exact: true })
}

export function clearFiltersButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Clear graph filters' })
}

/** The projection-derived block tally, which is unaffected by viewport virtualisation. */
export function blockCountStatus(page: Page): Locator {
  return page.getByRole('status').filter({ hasText: /blocks/ })
}

export function sourceRegion(page: Page): Locator {
  return page.getByRole('region', { name: 'Skill source' })
}

export function sourceCursorLine(page: Page): Locator {
  return sourceRegion(page).getByText(/^Line \d+$/)
}

export function sourceFindingCount(page: Page): Locator {
  return sourceRegion(page).getByRole('status')
}

export function markdownPreviewDialog(page: Page): Locator {
  return page.getByRole('dialog')
}

export async function selectSample(page: Page, label: SampleLabel): Promise<void> {
  await page.getByLabel('Sample').selectOption({ label })
}

/**
 * Most specs pin a specific sample rather than relying on whichever one loads
 * first, so that adding a sample to the host cannot silently retarget them.
 */
export async function openSample(page: Page, sample: keyof typeof sampleLabels): Promise<void> {
  await page.goto('/')
  await selectSample(page, sampleLabels[sample])
  await expect(editorRegion(page, graphNames[sample])).toBeVisible()
}
