import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  createLauncher,
  isTrustedHost,
  type LaunchRequest,
  type LauncherPlatform,
  platformCommand,
  type Spawn,
} from '../../src/editor-launcher'

const linux: LauncherPlatform = { platform: 'linux', env: {}, exists: () => false, home: '/home/me', container: false }

function request(patch: Partial<LaunchRequest> & { json?: unknown } = {}): LaunchRequest {
  const { json = { binary: 'zed', args: ['/app/x.php:3'] }, ...rest } = patch
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000', 'host': 'localhost:3000' },
    remoteAddress: '127.0.0.1',
    body: async () => json,
    ...rest,
  }
}

/** A spawn that starts (or fails with `error`) on the next tick. */
function fakeSpawn(error?: NodeJS.ErrnoException) {
  const unref = vi.fn()
  const spawn = vi.fn<Spawn>(() => {
    const child = Object.assign(new EventEmitter(), { unref }) as unknown as ChildProcess
    setTimeout(() => (error ? child.emit('error', error) : child.emit('spawn')))
    return child
  })
  return { spawn, unref }
}

describe('editor launcher: who may launch', () => {
  it('launches for a page on this machine and detaches the editor', async () => {
    const { spawn, unref } = fakeSpawn()
    const result = await createLauncher([], spawn, linux)(request())
    expect(result).toEqual({ status: 204 })
    expect(spawn).toHaveBeenCalledWith('zed', ['/app/x.php:3'], expect.objectContaining({ detached: true, stdio: 'ignore' }))
    expect(unref).toHaveBeenCalled()
  })

  it.each([
    ['another machine', { remoteAddress: '192.168.1.20' }, 403],
    ['a GET', { method: 'GET' }, 405],
    ['a form post (no preflight)', { headers: { 'content-type': 'text/plain', 'origin': 'http://localhost:3000', 'host': 'localhost:3000' } }, 415],
    ['no Origin', { headers: { 'content-type': 'application/json', 'host': 'localhost:3000' } }, 403],
    ['a cross-site page', { headers: { 'content-type': 'application/json', 'origin': 'https://evil.example', 'host': 'localhost:3000' } }, 403],
    ['a DNS-rebinding page', { headers: { 'content-type': 'application/json', 'origin': 'http://evil.example:3000', 'host': 'evil.example:3000' } }, 403],
  ] as const)('refuses %s', async (_, patch, status) => {
    const { spawn } = fakeSpawn()
    const result = await createLauncher([], spawn, linux)(request(patch as Partial<LaunchRequest>))
    expect(result.status).toBe(status)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('accepts a page behind a local proxy that forwards its host', async () => {
    const { spawn } = fakeSpawn()
    const result = await createLauncher([], spawn, linux)(request({
      headers: {
        'content-type': 'application/json',
        'origin': 'https://shop.test:9443',
        'host': 'localhost:3000',
        'x-forwarded-host': 'shop.test:9443',
      },
    }))
    expect(result.status).toBe(204)
  })

  it('rejects malformed commands', async () => {
    const { spawn } = fakeSpawn()
    const launch = createLauncher([], spawn, linux)
    for (const json of [null, { binary: '', args: [] }, { binary: 'zed', args: 'x' }, { binary: 'zed\0', args: [] }]) {
      expect((await launch(request({ json }))).status).toBe(400)
    }
    expect(spawn).not.toHaveBeenCalled()
  })

  it('says when the binary is not found', async () => {
    const { spawn } = fakeSpawn(Object.assign(new Error('spawn zed ENOENT'), { code: 'ENOENT' }))
    const result = await createLauncher([], spawn, linux)(request())
    expect(result.status).toBe(404)
    expect(result.message).toContain('zed was not found where the dev server runs')
  })
})

describe('editor launcher: probe and container', () => {
  const container = { ...linux, container: true }

  it('answers a probe without running anything, warning when the dev server runs in a container', async () => {
    const { spawn } = fakeSpawn()
    const probe = request({ json: { probe: true } })
    expect(await createLauncher([], spawn, linux)(probe)).toEqual({ status: 204 })
    expect(await createLauncher([], spawn, container)(probe)).toMatchObject({ status: 409, message: expect.stringContaining('in a container') })
    expect((await createLauncher([], spawn, linux)({ ...probe, remoteAddress: '172.18.0.5' })).status).toBe(403)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('still launches in a container, which may hold the editor, and explains a missing binary there', async () => {
    expect((await createLauncher([], fakeSpawn().spawn, container)(request())).status).toBe(204)
    const missing = fakeSpawn(Object.assign(new Error('spawn zed ENOENT'), { code: 'ENOENT' }))
    expect((await createLauncher([], missing.spawn, container)(request())).message).toContain('zed: the dev server runs in a container')
  })
})

describe('isTrustedHost', () => {
  it('trusts loopback names and addresses, reserved local names and configured hosts', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', 'app.localhost', 'union-demo1.test']) {
      expect(isTrustedHost(host, []), host).toBe(true)
    }
    expect(isTrustedHost('evil.example', [])).toBe(false)
    expect(isTrustedHost('192.168.1.20', [])).toBe(false)
    expect(isTrustedHost('shop.dev.example', ['.dev.example'])).toBe(true)
    expect(isTrustedHost('dev.example', ['.dev.example'])).toBe(true)
    expect(isTrustedHost('evildev.example', ['.dev.example'])).toBe(false)
  })
})

describe('platformCommand', () => {
  const windows = (files: string[]): LauncherPlatform => ({
    platform: 'win32',
    env: { PATH: 'C:\\Windows;C:\\Code\\bin', PATHEXT: '.COM;.EXE;.BAT;.CMD', ComSpec: 'C:\\Windows\\cmd.exe' },
    exists: path => files.includes(path),
    home: 'C:\\Users\\me',
    container: false,
  })

  it('runs the binary as is on Linux and macOS', () => {
    expect(platformCommand({ binary: 'phpstorm', args: ['--line', '3', '/x.php'] }, { ...linux, platform: 'darwin' }))
      .toEqual({ file: 'phpstorm', args: ['--line', '3', '/x.php'], verbatim: false })
  })

  it('expands a leading ~ to the home directory, as a shell would', () => {
    expect(platformCommand({ binary: '~/.nix-profile/bin/zeditor', args: [] }, linux))
      .toEqual({ file: '/home/me/.nix-profile/bin/zeditor', args: [], verbatim: false })
    expect(platformCommand({ binary: '~me/bin/zed', args: [] }, linux)).toMatchObject({ file: '~me/bin/zed' })
    expect(platformCommand({ binary: '~\\bin\\zed.exe', args: [] }, windows([])))
      .toMatchObject({ file: 'C:\\Users\\me\\bin\\zed.exe' })
  })

  it('finds a Windows executable by PATHEXT and runs an .exe directly', () => {
    expect(platformCommand({ binary: 'phpstorm64', args: ['C:/x.php'] }, windows(['C:\\Code\\bin\\phpstorm64.EXE'])))
      .toEqual({ file: 'C:\\Code\\bin\\phpstorm64.EXE', args: ['C:/x.php'], verbatim: false })
  })

  it('runs a batch shim (VS Code `code`) through cmd.exe with every argument quoted', () => {
    expect(platformCommand({ binary: 'code', args: ['--goto', 'C:/My Shop/x.php:3'] }, windows(['C:\\Code\\bin\\code.CMD'])))
      .toEqual({
        file: 'C:\\Windows\\cmd.exe',
        args: ['/d', '/v:off', '/s', '/c', '""C:\\Code\\bin\\code.CMD" "--goto" "C:/My Shop/x.php:3""'],
        verbatim: true,
      })
  })

  it('refuses batch-file arguments that cmd.exe would expand or unquote', () => {
    for (const arg of ['C:/a"&calc.php', 'C:/%PATH%.php']) {
      expect(platformCommand({ binary: 'code.cmd', args: [arg] }, windows([]))).toMatch(/may not contain/)
    }
  })
})
