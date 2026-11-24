// Dev-server endpoint that runs the editor command chosen on the settings screen. It runs what the
// page asks for, so it answers only to this machine and to pages on trusted hosts. Design and threat
// model: docs/architecture.md.

import { type ChildProcess, spawn as nodeSpawn, type SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { win32 } from 'node:path'
import { defineEventHandler, type H3Event, readBody, setResponseHeader, setResponseStatus } from 'h3'

export interface LaunchRequest {
  method: string | undefined
  headers: Record<string, string | undefined>
  /** Address of the TCP peer: the browser, or a proxy on this machine. */
  remoteAddress: string | undefined
  /** Read only once the request passed the checks. */
  body: () => Promise<unknown>
}

export interface LaunchResult {
  status: number
  message?: string
}

export interface LaunchCommand {
  binary: string
  args: string[]
}

export interface LauncherPlatform {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  exists: (path: string) => boolean
  /** Replaces a leading `~`: spawn runs no shell, and Home Manager or Homebrew paths start there. */
  home: string
  /** The dev server runs in a container, where the user's desktop editor is usually absent. */
  container: boolean
}

export type Spawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess

const MAX_ARGS = 64

export function isLoopback(address: string | undefined): boolean {
  if (!address) {
    return false
  }
  const ip = address.replace(/^::ffff:/i, '')
  return ip === '::1' || /^127(?:\.\d{1,3}){3}$/.test(ip)
}

/**
 * Hosts a page may be served from to call the launcher. A DNS-rebinding page has a public name, so
 * only loopback addresses, `localhost`, the reserved `.localhost` / `.test` names and configured
 * hosts qualify.
 */
export function isTrustedHost(hostname: string, allowedHosts: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (isLoopback(host) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.test')) {
    return true
  }
  return allowedHosts.some((allowed) => {
    const entry = allowed.toLowerCase()
    return entry.startsWith('.') ? host === entry.slice(1) || host.endsWith(entry) : host === entry
  })
}

/** Why the request may not launch anything; `undefined` when it may. */
export function rejectLaunch(request: LaunchRequest, allowedHosts: readonly string[]): LaunchResult | undefined {
  if (request.method !== 'POST') {
    return { status: 405, message: 'POST only' }
  }
  if (!isLoopback(request.remoteAddress)) {
    return {
      status: 403,
      message: 'the dev server runs in a container or behind a proxy elsewhere, so it cannot start your editor: open files with a link',
    }
  }
  // A JSON body cannot be sent cross-site without a CORS preflight, which this endpoint never grants.
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    return { status: 415, message: 'expected a JSON body' }
  }
  let origin: URL
  try {
    origin = new URL(request.headers.origin ?? '')
  }
  catch {
    return { status: 403, message: 'the request has no Origin' }
  }
  const hosts = [request.headers['x-forwarded-host']?.split(',')[0]?.trim(), request.headers.host]
  if (!hosts.includes(origin.host) || !isTrustedHost(origin.hostname, allowedHosts)) {
    return {
      status: 403,
      message: `pages on ${origin.host} may not launch an editor; add the host to backendLens.editor.allowedHosts`,
    }
  }
  return undefined
}

/** A request that asks only whether a launch would be accepted: the settings screen warns early. */
export function isProbe(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as Record<string, unknown>).probe === true
}

const IN_CONTAINER = 'the dev server runs in a container, where your editor is not installed: open files with a link'

export function parseLaunchCommand(body: unknown): LaunchCommand | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined
  }
  const { binary, args } = body as Record<string, unknown>
  const valid = (value: unknown): value is string => typeof value === 'string' && !value.includes('\0')
  if (!valid(binary) || !binary.trim() || !Array.isArray(args) || args.length > MAX_ARGS || !args.every(valid)) {
    return undefined
  }
  return { binary: binary.trim(), args }
}

/** A Windows executable as CreateProcess needs it: with its extension, found on PATH by PATHEXT. */
function resolveWindowsBinary(binary: string, { env, exists }: LauncherPlatform): string {
  if (win32.extname(binary)) {
    return binary
  }
  const extensions = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  const directories = /[\\/]/.test(binary) ? [''] : (env.PATH ?? env.Path ?? '').split(';').filter(Boolean)
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = directory ? win32.join(directory, binary + extension) : binary + extension
      if (exists(candidate)) {
        return candidate
      }
    }
  }
  return binary
}

/**
 * The process to spawn, without a shell. Windows runs `.cmd` / `.bat` shims (VS Code's `code`)
 * only through cmd.exe, where quoting cannot neutralize `"` or `%`: such arguments are refused.
 */
export function platformCommand(command: LaunchCommand, platform: LauncherPlatform): { file: string, args: string[], verbatim: boolean } | string {
  const binary = command.binary.replace(/^~(?=$|[\\/])/, () => platform.home)
  if (platform.platform !== 'win32') {
    return { file: binary, args: command.args, verbatim: false }
  }
  const file = resolveWindowsBinary(binary, platform)
  if (!/\.(?:bat|cmd)$/i.test(file)) {
    return { file, args: command.args, verbatim: false }
  }
  const parts = [file, ...command.args]
  if (parts.some(part => /["%\r\n]/.test(part))) {
    return `${file} is a batch file: its arguments may not contain " or %`
  }
  const line = parts.map(part => `"${part}"`).join(' ')
  return { file: platform.env.ComSpec ?? 'cmd.exe', args: ['/d', '/v:off', '/s', '/c', `"${line}"`], verbatim: true }
}

export function createLauncher(
  allowedHosts: readonly string[],
  spawn: Spawn = nodeSpawn,
  platform: LauncherPlatform = {
    platform: process.platform,
    env: process.env,
    exists: existsSync,
    home: homedir(),
    container: existsSync('/.dockerenv') || existsSync('/run/.containerenv'),
  },
): (request: LaunchRequest) => Promise<LaunchResult> {
  return async (request) => {
    const rejected = rejectLaunch(request, allowedHosts)
    if (rejected) {
      return rejected
    }
    const body = await request.body().catch(() => undefined)
    // A container may still hold the editor (a VS Code dev container): the probe warns, the launch tries.
    if (isProbe(body)) {
      return platform.container ? { status: 409, message: IN_CONTAINER } : { status: 204 }
    }
    const command = parseLaunchCommand(body)
    if (!command) {
      return { status: 400, message: 'expected { binary: string, args: string[] }' }
    }
    const resolved = platformCommand(command, platform)
    if (typeof resolved === 'string') {
      return { status: 400, message: resolved }
    }
    try {
      const child = spawn(resolved.file, resolved.args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        windowsVerbatimArguments: resolved.verbatim,
      })
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })
      child.unref()
      return { status: 204 }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          status: 404,
          message: platform.container ? `${command.binary}: ${IN_CONTAINER}` : `${command.binary} was not found where the dev server runs: set its full path`,
        }
      }
      return { status: 500, message: error instanceof Error ? error.message : String(error) }
    }
  }
}

export function editorLauncherHandler(allowedHosts: readonly string[]) {
  const launch = createLauncher(allowedHosts)
  return defineEventHandler(async (event: H3Event) => {
    const { req } = event.node
    const header = (name: string) => {
      const value = req.headers[name]
      return Array.isArray(value) ? value[0] : value
    }
    const result = await launch({
      method: req.method,
      headers: {
        'content-type': header('content-type'),
        'origin': header('origin'),
        'host': header('host'),
        'x-forwarded-host': header('x-forwarded-host'),
      },
      remoteAddress: req.socket.remoteAddress,
      body: () => readBody(event),
    })
    setResponseStatus(event, result.status)
    if (!result.message) {
      return null
    }
    setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
    return result.message
  })
}
