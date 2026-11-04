import { expect, test } from '@playwright/test'

// Colour mode: the toolbar follows the app page (a `dark` / `light` class, e.g. @nuxtjs/color-mode)
// and otherwise the system; the DevTools tab follows the colour mode of the document that embeds it
// (Nuxt DevTools' client marks it with `light` / `dark`), switching live.

test.describe('toolbar', () => {
  test('follows the system preference', async ({ browser }) => {
    for (const scheme of ['light', 'dark'] as const) {
      const page = await browser.newPage({ colorScheme: scheme })
      await page.goto('/')
      await expect(page.getByTestId('backend-lens-root')).toHaveAttribute('data-theme', scheme)
      await page.close()
    }
  })

  test('prefers the app’s own colour-mode class and follows its changes', async ({ browser }) => {
    const page = await browser.newPage({ colorScheme: 'light' })
    await page.goto('/')
    const root = page.getByTestId('backend-lens-root')
    await expect(root).toHaveAttribute('data-theme', 'light')

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(root).toHaveAttribute('data-theme', 'dark')
    await page.evaluate(() => document.documentElement.classList.replace('dark', 'light'))
    await expect(root).toHaveAttribute('data-theme', 'light')

    // The palette really changes: the panel background follows.
    await page.evaluate(() => document.documentElement.classList.replace('light', 'dark'))
    await root.getByTestId('backend-lens-badge').click()
    const background = await root.getByTestId('backend-lens-panel').evaluate(element => getComputedStyle(element).backgroundColor)
    expect(background).toBe('rgb(21, 21, 21)')
    await page.close()
  })
})

test('the DevTools tab follows the colour mode of the document embedding it', async ({ browser }) => {
  const page = await browser.newPage({ colorScheme: 'light' })
  await page.goto('/stats')
  // The app document plays Nuxt DevTools' client here: it carries the colour-mode class.
  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    const frame = document.createElement('iframe')
    frame.id = 'lens-tab'
    frame.src = '/__backend-lens/'
    frame.style.cssText = 'width: 1200px; height: 600px'
    document.body.appendChild(frame)
  })
  const tab = page.frameLocator('#lens-tab')
  const root = tab.getByTestId('backend-lens-root')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  // Embedded: no own title, the DevTools tab carries it.
  await expect(tab.getByTestId('backend-lens-panel').locator('strong', { hasText: 'Backend Lens' })).toHaveCount(0)

  await page.evaluate(() => document.documentElement.classList.replace('dark', 'light'))
  await expect(root).toHaveAttribute('data-theme', 'light')
  await page.close()
})
