import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { editorRegion, graphNames } from './helpers.js'

function search(page: Page): Locator {
  return page.getByRole('combobox', { name: 'Go to skill' })
}

function results(page: Page): Locator {
  return page.getByRole('listbox', { name: 'Matching skills' })
}

test.describe('skill search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('keeps the results hidden until a query is typed', async ({ page }) => {
    await search(page).focus()

    await expect(search(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(results(page)).toBeHidden()
  })

  test('narrows to the matching skills, prefix matches first', async ({ page }) => {
    await search(page).fill('c')

    await expect(search(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(results(page).getByRole('option')).toHaveText([graphNames.traversal, graphNames.complex])
  })

  // `type="search"` also clears natively on Escape, so this guards the user-visible
  // behaviour rather than the handler branch alone.
  test('clears the query and hides the results on Escape', async ({ page }) => {
    await search(page).fill('c')
    await expect(results(page)).toBeVisible()

    await search(page).press('Escape')

    await expect(search(page)).toHaveValue('')
    await expect(results(page)).toBeHidden()
  })

  test('wraps from the first option to the last on ArrowUp', async ({ page }) => {
    await search(page).fill('c')
    await expect(results(page).getByRole('option', { selected: true })).toHaveText(graphNames.traversal)

    await search(page).press('ArrowUp')

    await expect(results(page).getByRole('option', { selected: true })).toHaveText(graphNames.complex)
  })

  test('reports when nothing matches the query', async ({ page }) => {
    await search(page).fill('nothing-matches-this')

    await expect(results(page).getByRole('status')).toHaveText('No matching skills')
    await expect(results(page).getByRole('option')).toHaveCount(0)
  })

  test('navigates to a clicked option and clears the query', async ({ page }) => {
    await expect(editorRegion(page, graphNames.complex)).toBeVisible()
    await search(page).fill('preview')

    await results(page).getByRole('option', { name: graphNames.previewBuild }).click()

    await expect(editorRegion(page, graphNames.previewBuild)).toBeVisible()
    await expect(search(page)).toHaveValue('')
    await expect(results(page)).toBeHidden()
  })
})
