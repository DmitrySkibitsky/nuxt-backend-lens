import { expect, type Locator, type Page, test } from '@playwright/test'

// Opening source paths in an editor: off by default, chosen on the settings screen (kept in
// localStorage), as editor URLs or as commands run by the dev-server launcher. The demo backend runs
// in a container with its project at /app, which is what the records report.

const LAUNCHER = '**/__backend-lens/open-in-editor'

async function openPanel(page: Page): Promise<Locator> {
  await page.getByTestId('backend-lens-badge').click()
  const panel = page.getByTestId('backend-lens-panel')
  await expect(panel).toBeVisible()
  return panel
}

const row = (panel: Locator, text: string | RegExp) => panel.getByRole('listitem').filter({ hasText: text })

/** Opens /books and its request: the N+1 of BookResource.php:29. */
async function openBooks(page: Page): Promise<Locator> {
  await page.goto('/books')
  await expect(page.locator('main table')).toBeVisible()
  const panel = await openPanel(page)
  await row(panel, /GET\/api\/books\d/).click()
  await expect(panel.getByTestId('backend-lens-issue-source')).toBeVisible()
  return panel
}

async function configure(panel: Locator, choose: (settings: Locator) => Promise<void>) {
  await panel.getByTestId('backend-lens-settings-toggle').click()
  const settings = panel.getByTestId('backend-lens-settings')
  await expect(settings).toBeVisible()
  await choose(settings)
  await panel.getByTestId('backend-lens-settings-toggle').click()
  await expect(settings).toHaveCount(0)
}

test('source paths stay plain text until an editor is chosen', async ({ page }) => {
  const panel = await openBooks(page)
  await expect(panel.getByTestId('backend-lens-issue-source')).toContainText('BookResource.php:29')
  await expect(panel.getByTestId('backend-lens-source-link')).toHaveCount(0)
})

test('an editor preset turns call sites and the controller into editor links', async ({ page }) => {
  const panel = await openBooks(page)
  await configure(panel, settings => settings.getByTestId('backend-lens-settings-editor-vscode').check())

  await expect(panel.getByTestId('backend-lens-issue-source').getByTestId('backend-lens-source-link'))
    .toHaveAttribute('href', 'vscode://file/app/app/Http/Resources/BookResource.php:29')
  // Clockwork names the controller by class only (PSR-4 → line 1), Debugbar by file and action line.
  await expect(panel.getByTestId('backend-lens-controller'))
    .toHaveAttribute('href', /^vscode:\/\/file\/app\/app\/Http\/Controllers\/Api\/BookController\.php:\d+$/)
  // Every query row links its own call site.
  const rowLinks = panel.locator('[data-testid="backend-lens-query"] [data-testid="backend-lens-source-link"]')
  expect(await rowLinks.count()).toBeGreaterThan(0)

  // Chosen once per browser: kept across a reload.
  const reloaded = await openBooks(page)
  await expect(reloaded.getByTestId('backend-lens-issue-source').getByTestId('backend-lens-source-link'))
    .toHaveAttribute('href', /^vscode:/)
})

test('the server project root maps to a local one', async ({ page }) => {
  const panel = await openBooks(page)
  await configure(panel, async (settings) => {
    await settings.getByTestId('backend-lens-settings-editor-phpstorm').check()
    await expect(settings.getByTestId('backend-lens-settings-server-root')).toHaveAttribute('placeholder', '/app')
    await settings.getByTestId('backend-lens-settings-local-root').fill('/home/me/My Shop/backend')
    await expect(settings.getByTestId('backend-lens-settings-preview-target'))
      .toContainText('phpstorm://open?file=%2Fhome%2Fme%2FMy%20Shop%2Fbackend%2F')
  })
  await expect(panel.getByTestId('backend-lens-issue-source').getByTestId('backend-lens-source-link')).toHaveAttribute(
    'href',
    'phpstorm://open?file=%2Fhome%2Fme%2FMy%20Shop%2Fbackend%2Fapp%2FHttp%2FResources%2FBookResource.php&line=29',
  )
})

test('a command runs through the dev-server launcher, and its failure is shown', async ({ page }) => {
  const launches: unknown[] = []
  let answer = { status: 204, body: '' }
  // The browser and the dev server do not share a machine on the stand: the launcher is stubbed here
  // and checked by unit tests (requests from this machine only) and a 403 below.
  await page.route(LAUNCHER, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (body.probe) {
      return route.fulfill({ status: 204 })
    }
    launches.push(body)
    await route.fulfill(answer)
  })
  const panel = await openBooks(page)
  await configure(panel, async (settings) => {
    await settings.getByTestId('backend-lens-settings-editor-zed').check()
    await settings.getByTestId('backend-lens-settings-launch-command').check()
    await settings.getByTestId('backend-lens-settings-binary').fill('~/.nix-profile/bin/zeditor')
  })

  const link = panel.getByTestId('backend-lens-issue-source').getByTestId('backend-lens-source-link')
  await link.click()
  await expect.poll(() => launches).toEqual([
    { binary: '~/.nix-profile/bin/zeditor', args: ['/app/app/Http/Resources/BookResource.php:29'] },
  ])
  await expect(panel.getByTestId('backend-lens-launch-error')).toHaveCount(0)

  answer = { status: 404, body: 'zeditor was not found where the dev server runs: set its full path' }
  await link.click()
  await expect(panel.getByTestId('backend-lens-launch-error')).toContainText('zeditor was not found')
})

test('the settings screen warns when the dev server cannot run commands for this page', async ({ page }) => {
  const panel = await openBooks(page)
  await panel.getByTestId('backend-lens-settings-toggle').click()
  const settings = panel.getByTestId('backend-lens-settings')
  await settings.getByTestId('backend-lens-settings-editor-custom').check()
  const refusal = settings.getByTestId('backend-lens-settings-launcher-refused')
  await expect(refusal).toContainText('cannot start your editor')
  await expect(refusal).toContainText('Choose a preset')

  await settings.getByTestId('backend-lens-settings-editor-zed').check()
  await expect(settings.getByTestId('backend-lens-settings-launch-url')).toBeChecked()
  await expect(refusal).toHaveCount(0)
})

test('the launcher refuses requests that do not come from this machine', async ({ request }) => {
  // The stand reaches the dev server through the proxy container: not a loopback peer.
  const response = await request.post('/__backend-lens/open-in-editor', {
    data: { binary: 'true', args: [] },
    headers: { origin: new URL(test.info().project.use.baseURL!).origin },
  })
  expect(response.status()).toBe(403)
})

test('exceptions and log entries link their source', async ({ page }) => {
  await page.goto('/')
  const panel = await openPanel(page)
  await configure(panel, settings => settings.getByTestId('backend-lens-settings-editor-zed').check())
  await panel.getByRole('button', { name: 'Close' }).click()

  await page.goto('/boom')
  await expect(page.locator('main .error')).toContainText('500')
  const boom = await openPanel(page)
  await row(boom, '/api/boom').first().click()
  await expect(boom.locator('.bl-exception [data-testid="backend-lens-source-link"]'))
    .toHaveAttribute('href', /^zed:\/\/file\/app\/app\/Http\/Controllers\/Api\/ScenarioController\.php:78$/)

  // Clockwork traces every log entry; Debugbar links an entry only when its collector reports a source.
  test.skip(process.env.DEBUG_BACKEND === 'debugbar', 'Debugbar log entries of the demo carry no source')
  await page.goto('/logs')
  await expect(page.locator('main pre')).toContainText('logged')
  const logs = await openPanel(page)
  await row(logs, '/api/logs').first().click()
  await logs.getByTestId('backend-lens-tab-logs').click()
  await expect(logs.getByTestId('backend-lens-log-source').first().getByTestId('backend-lens-source-link'))
    .toHaveAttribute('href', 'zed://file/app/app/Http/Controllers/Api/ScenarioController.php:63')
})
