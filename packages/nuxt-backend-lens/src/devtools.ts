// Nuxt DevTools integration: a custom tab whose iframe page loads the lens UI through the app's own
// Vite dev server and reads the running lens from the app window. Dev only.

import { addCustomTab } from '@nuxt/devtools-kit'
import { addDevServerHandler, type Resolver, resolvePath } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { defineEventHandler, setResponseHeader } from 'h3'
import { joinURL } from 'ufo'
import type { DevtoolsTabOptions } from './runtime/core/options'

export async function setupDevtoolsTab(options: DevtoolsTabOptions, nuxt: Nuxt, resolver: Resolver): Promise<void> {
  const shell = await resolvePath(resolver.resolve('./runtime/shells/devtools'))
  const route = joinURL(nuxt.options.app.baseURL, options.route)
  // Vite serves any allowed file under <buildAssetsDir>/@fs/<absolute path>, compiling TS and SFCs.
  const shellUrl = joinURL(nuxt.options.app.baseURL, nuxt.options.app.buildAssetsDir, '@fs', shell)

  addDevServerHandler({
    route,
    handler: defineEventHandler((event) => {
      setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
      return page(shellUrl)
    }),
  })

  addCustomTab({
    name: 'backend-lens',
    title: 'Backend Lens',
    icon: options.icon,
    view: { type: 'iframe', src: route },
  }, nuxt)
}

function page(shellUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Backend Lens</title>
  <style>html, body { margin: 0; height: 100%; }</style>
</head>
<body>
  <div id="backend-lens"></div>
  <script type="module">
    import { mountDevtoolsPanel } from ${JSON.stringify(shellUrl)}
    mountDevtoolsPanel(document.getElementById('backend-lens'))
  </script>
</body>
</html>`
}
