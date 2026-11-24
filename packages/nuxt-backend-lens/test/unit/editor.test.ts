import { describe, expect, it } from 'vitest'
import {
  commandArgs,
  controllerLocation,
  DEFAULT_EDITOR_SETTINGS,
  editorPresets,
  type EditorSettings,
  editorTarget,
  localPath,
  parseEditorSettings,
} from '../../src/runtime/core/editor'
import { defaultOptions, resolveOptions } from '../../src/runtime/core/options'

const settings = (patch: Partial<EditorSettings>): EditorSettings => ({ ...DEFAULT_EDITOR_SETTINGS, ...patch })
const options = defaultOptions.editor
const LAUNCHER = '/__backend-lens/open-in-editor'

describe('localPath', () => {
  it('keeps an absolute path when there is nothing to map', () => {
    expect(localPath('/app/app/Models/Book.php', settings({}), '/app')).toBe('/app/app/Models/Book.php')
  })

  it('maps the server root (from the record or the settings) to the local root', () => {
    const mapped = settings({ localRoot: '/home/me/shop/' })
    expect(localPath('/app/app/Models/Book.php', mapped, '/app')).toBe('/home/me/shop/app/Models/Book.php')
    expect(localPath('/srv/www/app/Models/Book.php', { ...mapped, serverRoot: '/srv/www' }, '/app'))
      .toBe('/home/me/shop/app/Models/Book.php')
  })

  it('maps on path segments only', () => {
    expect(localPath('/application/x.php', settings({ localRoot: '/home/me' }), '/app')).toBe('/application/x.php')
  })

  it('resolves a relative path against the local root, else the server root', () => {
    expect(localPath('app/Models/Book.php', settings({ localRoot: '/home/me/shop' }), '/app')).toBe('/home/me/shop/app/Models/Book.php')
    expect(localPath('app/Models/Book.php', settings({}), '/app')).toBe('/app/app/Models/Book.php')
    expect(localPath('app/Models/Book.php', settings({}))).toBeUndefined()
  })

  it('handles Windows paths on either side, with forward slashes and case-insensitive roots', () => {
    expect(localPath('C:\\www\\shop\\app\\Book.php', settings({ serverRoot: 'c:\\WWW\\shop', localRoot: 'D:\\code\\shop' })))
      .toBe('D:/code/shop/app/Book.php')
    expect(localPath('/app/app/Book.php', settings({ localRoot: 'C:\\Users\\me\\shop' }), '/app'))
      .toBe('C:/Users/me/shop/app/Book.php')
    // Unix paths stay case-sensitive.
    expect(localPath('/App/x.php', settings({ localRoot: '/home/me' }), '/app')).toBe('/App/x.php')
  })
})

describe('controllerLocation', () => {
  const namespaces = { 'App\\': 'app/', 'App\\Ship\\': 'src/Ship/' }

  it('prefers the file the record names', () => {
    const source = { file: 'app/Http/X.php', line: 10 }
    expect(controllerLocation({ controller: 'App\\Http\\X@index', controllerSource: source }, namespaces)).toBe(source)
  })

  it('derives the file from the class by the longest PSR-4 prefix, at an unknown line', () => {
    expect(controllerLocation({ controller: 'App\\Http\\Controllers\\Api\\FeatureFlagController@index' }, namespaces))
      .toEqual({ file: 'app/Http/Controllers/Api/FeatureFlagController.php', line: null })
    expect(controllerLocation({ controller: '\\App\\Ship\\Http\\Controller' }, namespaces))
      .toEqual({ file: 'src/Ship/Http/Controller.php', line: null })
  })

  it('gives up on closures and unknown namespaces', () => {
    expect(controllerLocation({ controller: 'Closure' }, namespaces)).toBeUndefined()
    expect(controllerLocation({ controller: 'Vendor\\Package\\Controller@x' }, namespaces)).toBeUndefined()
    expect(controllerLocation({}, namespaces)).toBeUndefined()
  })
})

describe('editorTarget', () => {
  const location = { file: '/app/app/Http/Controllers/Api/FeatureFlagController.php', line: 39 }

  it('is off until an editor is chosen', () => {
    expect(editorTarget(location, { settings: settings({}), options, launcher: LAUNCHER })).toBeUndefined()
  })

  it('builds each preset URL, with line 1 when the line is unknown', () => {
    const url = (editor: string, file = location.file, line: number | null = 39) =>
      (editorTarget({ file, line }, { settings: settings({ editor }), options }) as { url: string }).url
    expect(url('vscode')).toBe('vscode://file/app/app/Http/Controllers/Api/FeatureFlagController.php:39')
    expect(url('zed')).toBe('zed://file/app/app/Http/Controllers/Api/FeatureFlagController.php:39')
    expect(url('phpstorm', location.file, null))
      .toBe('phpstorm://open?file=%2Fapp%2Fapp%2FHttp%2FControllers%2FApi%2FFeatureFlagController.php&line=1')
  })

  it('encodes Windows paths and spaces into URLs', () => {
    const target = editorTarget({ file: 'app/My Book.php', line: 3 }, {
      settings: settings({ editor: 'vscode', localRoot: 'C:\\Users\\me\\shop' }),
      options,
    })
    expect(target).toEqual({ kind: 'url', url: 'vscode://file/C:/Users/me/shop/app/My%20Book.php:3' })
  })

  it('runs the preset command, with the binary and arguments overridable, through the launcher only', () => {
    const command = settings({ editor: 'phpstorm', launch: 'command' })
    expect(editorTarget(location, { settings: command, options, launcher: LAUNCHER }))
      .toEqual({ kind: 'command', binary: 'phpstorm', args: ['--line', '39', location.file] })
    expect(editorTarget(location, { settings: { ...command, binary: '/run/current-system/sw/bin/phpstorm', args: '{file}:{line}' }, options, launcher: LAUNCHER }))
      .toEqual({ kind: 'command', binary: '/run/current-system/sw/bin/phpstorm', args: [`${location.file}:39`] })
    expect(editorTarget(location, { settings: command, options })).toBeUndefined()
  })

  it('runs a custom command once a binary is set', () => {
    const custom = settings({ editor: 'custom', launch: 'command' })
    expect(editorTarget(location, { settings: custom, options, launcher: LAUNCHER })).toBeUndefined()
    expect(editorTarget(location, { settings: { ...custom, binary: 'zeditor' }, options, launcher: LAUNCHER }))
      .toEqual({ kind: 'command', binary: 'zeditor', args: [`${location.file}:39`] })
  })

  it('has no target for an unknown preset or an unresolvable path', () => {
    expect(editorTarget(location, { settings: settings({ editor: 'gone' }), options })).toBeUndefined()
    expect(editorTarget({ file: 'app/x.php', line: 1 }, { settings: settings({ editor: 'vscode' }), options })).toBeUndefined()
  })
})

describe('commandArgs', () => {
  it('fills placeholders per argument, so a path with spaces stays one argument', () => {
    expect(commandArgs(' --goto  {file}:{line} ', '/home/me/My Shop/x.php', 7)).toEqual(['--goto', '/home/me/My Shop/x.php:7'])
  })
})

describe('editor settings and presets', () => {
  it('parses stored settings defensively', () => {
    expect(parseEditorSettings(null)).toEqual(DEFAULT_EDITOR_SETTINGS)
    expect(parseEditorSettings({ editor: 'zed', launch: 'telnet', binary: 42, localRoot: '/home/me' }))
      .toEqual({ ...DEFAULT_EDITOR_SETTINGS, editor: 'zed', localRoot: '/home/me' })
  })

  it('offers configured presets and skips malformed ones', () => {
    const resolved = resolveOptions({
      editor: {
        presets: {
          cursor: { label: 'Cursor', url: 'cursor://file{path}:{line}', binary: 'cursor', args: ['--goto', '{file}:{line}'] },
          broken: { label: 'Broken' },
          custom: { label: 'Shadowing the reserved id', url: 'x://', binary: 'x', args: [] },
        },
      },
    })
    expect(editorPresets(resolved.editor).map(([id]) => id)).toEqual(['vscode', 'phpstorm', 'zed', 'cursor'])
  })
})
