// Opening a backend source path in an editor: where the file lives on this machine and what opens
// it. Pure; the UI keeps the settings and the lens performs a launch. Design: docs/architecture.md.

import type { EditorOptions, EditorPreset } from './options'
import { isAbsolutePath, isRecord } from './trace'
import type { DebugDetails, SourceLocation } from './types'

/** Settings-screen id of the user's own command. */
export const CUSTOM_EDITOR = 'custom'

/** Arguments of a custom command when none are given. */
export const DEFAULT_CUSTOM_ARGS = '{file}:{line}'

export type EditorLaunch = 'url' | 'command'

/** Per-browser choices from the settings screen. */
export interface EditorSettings {
  /** A preset id, `custom`, or '' (paths stay plain text). */
  editor: string
  /** How a preset opens a file: its URL, or its command run by the dev server. */
  launch: EditorLaunch
  /** Executable for a command; '' takes the preset's. */
  binary: string
  /** Command arguments, separated by whitespace; '' takes the preset's. */
  args: string
  /** The backend's project root as its paths show it; '' takes it from the record. */
  serverRoot: string
  /** The same directory on this machine; '' opens the backend's paths as they are. */
  localRoot: string
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  editor: '',
  launch: 'url',
  binary: '',
  args: '',
  serverRoot: '',
  localRoot: '',
}

/** Stored settings over the defaults: storage may hold anything, including an older shape. */
export function parseEditorSettings(value: unknown): EditorSettings {
  const settings = { ...DEFAULT_EDITOR_SETTINGS }
  if (!isRecord(value)) {
    return settings
  }
  for (const key of ['editor', 'binary', 'args', 'serverRoot', 'localRoot'] as const) {
    if (typeof value[key] === 'string') {
      settings[key] = value[key]
    }
  }
  settings.launch = value.launch === 'command' ? 'command' : 'url'
  return settings
}

export type EditorTarget
  = | { kind: 'url', url: string }
    | { kind: 'command', binary: string, args: string[] }

/** What the dev-server launcher receives. */
export type EditorCommand = Extract<EditorTarget, { kind: 'command' }>

function isPreset(value: unknown): value is EditorPreset {
  return isRecord(value)
    && typeof value.label === 'string'
    && typeof value.url === 'string'
    && typeof value.binary === 'string'
    && Array.isArray(value.args)
    && value.args.every(arg => typeof arg === 'string')
}

/** Usable presets in option order; user-added entries are not validated by the option schema. */
export function editorPresets(options: Pick<EditorOptions, 'presets'>): [string, EditorPreset][] {
  return Object.entries(options.presets).filter((entry): entry is [string, EditorPreset] =>
    entry[0] !== CUSTOM_EDITOR && isPreset(entry[1]))
}

const toSlashes = (path: string) => path.replace(/\\/g, '/')
const trimEnd = (path: string) => path.replace(/(?<=.)\/+$/, '')
/** Windows paths compare case-insensitively. */
const isWindowsPath = (path: string) => /^(?:[A-Z]:|\/\/)/i.test(path)

/** `path` below `root` → the rest without a leading slash; `undefined` when it is not below it. */
function relativeTo(path: string, root: string): string | undefined {
  const base = trimEnd(toSlashes(root))
  const head = path.slice(0, base.length)
  const same = isWindowsPath(base) ? head.toLowerCase() === base.toLowerCase() : head === base
  if (!same) {
    return undefined
  }
  const rest = path.slice(base.length)
  if (rest === '' || base.endsWith('/')) {
    return rest
  }
  return rest.startsWith('/') ? rest.slice(1) : undefined
}

function join(root: string, relative: string): string {
  const base = trimEnd(toSlashes(root))
  const tail = relative.replace(/^(?:\.\/|\/)+/, '')
  return base.endsWith('/') ? `${base}${tail}` : `${base}/${tail}`
}

/**
 * The file on this machine, with forward slashes (every editor accepts them, on Windows too).
 * A relative path is relative to the project root; the server root maps to the local one.
 * `undefined` when a relative path has no root to resolve against.
 */
export function localPath(file: string, settings: EditorSettings, basePath?: string): string | undefined {
  const serverRoot = settings.serverRoot.trim() || basePath || ''
  const localRoot = settings.localRoot.trim()
  const path = toSlashes(file.trim())
  if (!path) {
    return undefined
  }
  if (!isAbsolutePath(path)) {
    const root = localRoot || serverRoot
    return root ? join(root, path) : undefined
  }
  if (serverRoot && localRoot) {
    const rest = relativeTo(path, serverRoot)
    if (rest !== undefined) {
      return join(localRoot, rest)
    }
  }
  return path
}

/**
 * The controller's file: from the record when it names one, otherwise from its class name through
 * the PSR-4 namespaces (longest prefix wins). Relative to the project root then, at line 1.
 */
export function controllerLocation(details: Pick<DebugDetails, 'controller' | 'controllerSource'>, namespaces: Record<string, string>): SourceLocation | undefined {
  if (details.controllerSource) {
    return details.controllerSource
  }
  const className = details.controller?.split('@')[0]?.trim().replace(/^\\/, '')
  if (!className || !/^[A-Z_]\w*(?:\\[A-Z_]\w*)*$/i.test(className)) {
    return undefined
  }
  const prefix = Object.keys(namespaces)
    .filter(namespace => typeof namespaces[namespace] === 'string' && className.startsWith(namespace))
    .sort((a, b) => b.length - a.length)[0]
  if (prefix === undefined) {
    return undefined
  }
  const directory = namespaces[prefix]!
  const relative = `${className.slice(prefix.length).replace(/\\/g, '/')}.php`
  return { file: directory ? join(directory, relative) : relative, line: null }
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match)
}

/** `{path}` of URL templates: URL-encoded segments behind a leading slash (`/C:/…` on Windows). */
function urlPath(file: string): string {
  return encodeURI(file.startsWith('/') ? file : `/${file}`).replace(/[?#]/g, encodeURIComponent)
}

/** Whitespace-separated template → arguments; placeholders are filled per argument, so a path with spaces stays one. */
export function commandArgs(template: string | readonly string[], file: string, line: number): string[] {
  const parts = typeof template === 'string' ? template.trim().split(/\s+/).filter(Boolean) : template
  return parts.map(part => fill(part, { file, line: String(line) }))
}

/**
 * What opens `location`, or `undefined` when nothing is chosen, the editor is unknown or the path
 * cannot be resolved. A command needs the dev-server launcher; without one there is no target.
 */
export function editorTarget(
  location: SourceLocation | undefined,
  context: { settings: EditorSettings, options: Pick<EditorOptions, 'presets'>, basePath?: string, launcher?: string },
): EditorTarget | undefined {
  const { settings } = context
  if (!location || !settings.editor) {
    return undefined
  }
  const file = localPath(location.file, settings, context.basePath)
  if (!file) {
    return undefined
  }
  const line = location.line && location.line > 0 ? location.line : 1
  if (settings.editor === CUSTOM_EDITOR) {
    const binary = settings.binary.trim()
    return binary && context.launcher
      ? { kind: 'command', binary, args: commandArgs(settings.args || DEFAULT_CUSTOM_ARGS, file, line) }
      : undefined
  }
  const preset = editorPresets(context.options).find(([id]) => id === settings.editor)?.[1]
  if (!preset) {
    return undefined
  }
  if (settings.launch === 'url') {
    return { kind: 'url', url: fill(preset.url, { file: encodeURIComponent(file), path: urlPath(file), line: String(line) }) }
  }
  if (!context.launcher) {
    return undefined
  }
  return {
    kind: 'command',
    binary: settings.binary.trim() || preset.binary,
    args: commandArgs(settings.args.trim() || preset.args, file, line),
  }
}
