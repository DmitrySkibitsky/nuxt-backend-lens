<template>
  <form
    class="bl-settings"
    data-testid="backend-lens-settings"
    @submit.prevent
  >
    <header class="bl-settings-intro">
      <h2 class="bl-settings-title">
        Open source files in an editor
      </h2>
      <p class="bl-muted">
        Call sites, controllers, exceptions and log sources become links. Saved in this browser only.
      </p>
    </header>

    <section class="bl-card">
      <h3
        :id="`${uid}-editor`"
        class="bl-card-title"
      >
        Editor
      </h3>
      <div
        class="bl-tiles"
        role="radiogroup"
        :aria-labelledby="`${uid}-editor`"
      >
        <label
          v-for="option in editorOptions"
          :key="option.id"
          class="bl-tile"
        >
          <input
            type="radio"
            :name="`${uid}-editor`"
            :value="option.id"
            :checked="settings.editor === option.id"
            :data-testid="`backend-lens-settings-editor-${option.id || 'off'}`"
            @change="selectEditor(option.id)"
          >
          <span class="bl-tile-title">{{ option.label }}</span>
          <span class="bl-tile-text">{{ option.text }}</span>
        </label>
      </div>
    </section>

    <section
      v-if="preset"
      class="bl-card"
    >
      <h3
        :id="`${uid}-launch`"
        class="bl-card-title"
      >
        Open with
      </h3>
      <div
        class="bl-tiles bl-tiles-wide"
        role="radiogroup"
        :aria-labelledby="`${uid}-launch`"
      >
        <label class="bl-tile">
          <input
            type="radio"
            :name="`${uid}-launch`"
            value="url"
            :checked="settings.launch === 'url'"
            data-testid="backend-lens-settings-launch-url"
            @change="update({ launch: 'url' })"
          >
          <span class="bl-tile-title">Link</span>
          <span class="bl-tile-text">The browser hands it to the editor's URL handler, which the OS must have registered.</span>
          <code class="bl-tile-code">{{ preset.url }}</code>
        </label>
        <label class="bl-tile">
          <input
            type="radio"
            :name="`${uid}-launch`"
            value="command"
            :checked="settings.launch === 'command'"
            :disabled="!launcher"
            data-testid="backend-lens-settings-launch-command"
            @change="update({ launch: 'command' })"
          >
          <span class="bl-tile-title">Command</span>
          <span class="bl-tile-text">Run by the Nuxt dev server, which must run on this machine, not in a container. For an editor without a URL handler or at a custom path.</span>
          <code class="bl-tile-code">{{ [preset.binary, ...preset.args].join(' ') }}</code>
        </label>
      </div>
    </section>

    <section
      v-if="usesCommand"
      class="bl-card"
    >
      <h3 class="bl-card-title">
        Command
      </h3>
      <p
        v-if="!launcher"
        class="bl-callout bl-callout-warn"
        data-testid="backend-lens-settings-no-launcher"
      >
        Commands are run by the dev server: they work under <code>nuxt dev</code> with
        <code>editor.launcher</code> on.
      </p>
      <p
        v-else-if="launcherRefusal"
        class="bl-callout bl-callout-warn"
        data-testid="backend-lens-settings-launcher-refused"
      >
        This page cannot run commands: {{ launcherRefusal }}.
        <template v-if="settings.editor === CUSTOM_EDITOR">
          Choose a preset instead: links work wherever the dev server runs.
        </template>
      </p>
      <div class="bl-field">
        <label
          class="bl-label"
          :for="`${uid}-binary`"
        >Binary</label>
        <input
          :id="`${uid}-binary`"
          class="bl-input"
          :value="settings.binary"
          :placeholder="preset?.binary ?? 'full path, or a name on PATH'"
          spellcheck="false"
          autocomplete="off"
          data-testid="backend-lens-settings-binary"
          @input="update({ binary: ($event.target as HTMLInputElement).value })"
        >
        <span class="bl-hint">
          A name on the dev server's <code>PATH</code>, or a full path (<code>~</code> is your home).
          <code>command -v zeditor</code> prints it; on Windows, <code>where zed</code>. Typical paths:
        </span>
        <dl class="bl-examples">
          <template
            v-for="example in BINARY_EXAMPLES"
            :key="example.os"
          >
            <dt>{{ example.os }}</dt>
            <dd><code>{{ example.path }}</code></dd>
          </template>
        </dl>
      </div>
      <div class="bl-field">
        <label
          class="bl-label"
          :for="`${uid}-args`"
        >Arguments</label>
        <input
          :id="`${uid}-args`"
          class="bl-input"
          :value="settings.args"
          :placeholder="preset ? preset.args.join(' ') : DEFAULT_CUSTOM_ARGS"
          spellcheck="false"
          autocomplete="off"
          data-testid="backend-lens-settings-args"
          @input="update({ args: ($event.target as HTMLInputElement).value })"
        >
        <span class="bl-hint">Separated by spaces; <code>{file}</code> and <code>{line}</code> are filled in. Empty: the placeholder.</span>
      </div>
    </section>

    <section
      v-if="settings.editor"
      class="bl-card"
    >
      <h3 class="bl-card-title">
        Path mapping
      </h3>
      <p class="bl-hint">
        For a backend in a container or on another machine. Without a local root, files open at the
        paths the backend reports.
      </p>
      <div class="bl-field-row">
        <div class="bl-field">
          <label
            class="bl-label"
            :for="`${uid}-server-root`"
          >Project root on the server</label>
          <input
            :id="`${uid}-server-root`"
            class="bl-input"
            :value="settings.serverRoot"
            :placeholder="detectedRoot ?? '/var/www/html'"
            spellcheck="false"
            autocomplete="off"
            data-testid="backend-lens-settings-server-root"
            @input="update({ serverRoot: ($event.target as HTMLInputElement).value })"
          >
          <span class="bl-hint">{{ detectedRoot ? `Empty: ${detectedRoot}, found in the records.` : 'Empty: found in the records.' }}</span>
        </div>
        <div class="bl-field">
          <label
            class="bl-label"
            :for="`${uid}-local-root`"
          >Project root on this machine</label>
          <input
            :id="`${uid}-local-root`"
            class="bl-input"
            :value="settings.localRoot"
            placeholder="/home/me/project or C:\projects\app"
            spellcheck="false"
            autocomplete="off"
            data-testid="backend-lens-settings-local-root"
            @input="update({ localRoot: ($event.target as HTMLInputElement).value })"
          >
        </div>
      </div>
    </section>

    <section
      v-if="settings.editor && sample"
      class="bl-card"
      data-testid="backend-lens-settings-preview"
    >
      <h3 class="bl-card-title">
        Preview
      </h3>
      <dl class="bl-examples bl-preview">
        <dt>Record</dt>
        <dd><code>{{ formatFrame(sample.location.file, sample.location.line) }}</code></dd>
        <template v-if="sampleTarget">
          <dt>Opens</dt>
          <dd><code data-testid="backend-lens-settings-preview-target">{{ describe(sampleTarget) }}</code></dd>
        </template>
      </dl>
      <p
        v-if="!sampleTarget"
        class="bl-callout bl-callout-warn"
        data-testid="backend-lens-settings-preview-problem"
      >
        {{ problem }}
      </p>
      <div
        v-else
        class="bl-preview-actions"
      >
        <SourceLink
          class="bl-try"
          :location="sample.location"
        >
          Try it
        </SourceLink>
        <span
          v-if="launchError"
          class="bl-status-error"
          role="alert"
        >{{ launchError }}</span>
      </div>
    </section>
  </form>
</template>

<script setup lang="ts">
import { computed, provide, ref, useId, watch } from 'vue'
import { CUSTOM_EDITOR, DEFAULT_CUSTOM_ARGS, editorPresets, type EditorSettings, type EditorTarget, editorTarget } from '../core/editor'
import type { SourceLocation } from '../core/types'
import { SOURCE_LINKS } from './editor'
import { formatFrame } from './format'
import SourceLink from './SourceLink.vue'
import { useLensUiState } from './state'

const BINARY_EXAMPLES = [
  { os: 'Home Manager', path: '~/.nix-profile/bin/zeditor' },
  { os: 'NixOS', path: '/run/current-system/sw/bin/zeditor' },
  { os: 'macOS', path: '/Applications/PhpStorm.app/Contents/MacOS/phpstorm' },
  { os: 'Windows', path: 'C:\\Program Files\\JetBrains\\PhpStorm\\bin\\phpstorm64.exe' },
]

const { lens, entries, editorSettings: settings, setEditorSettings } = useLensUiState()
const uid = useId()
const launcher = lens.editorLauncher
const presets = editorPresets(lens.options.editor)

const editorOptions = [
  { id: '', label: 'Off', text: 'Paths stay plain text' },
  ...presets.map(([id, preset]) => ({ id, label: preset.label, text: `${preset.url.split(':')[0]}:// or ${preset.binary}` })),
  { id: CUSTOM_EDITOR, label: 'Custom', text: 'Any binary and arguments' },
]

const preset = computed(() => presets.find(([id]) => id === settings.value.editor)?.[1])
const usesCommand = computed(() => settings.value.editor === CUSTOM_EDITOR
  || (preset.value !== undefined && settings.value.launch === 'command'))

function update(patch: Partial<EditorSettings>) {
  setEditorSettings({ ...settings.value, ...patch })
}

/**
 * Another editor takes other arguments and another binary: overrides of the previous one go. Custom
 * runs only as a command; leaving it returns to the default, a link.
 */
function selectEditor(editor: string) {
  const launch = editor === CUSTOM_EDITOR ? 'command' : settings.value.editor === CUSTOM_EDITOR ? 'url' : settings.value.launch
  update({ editor, binary: '', args: '', launch })
}

/** A call site from the captured records, to show what a link will open. */
const sample = computed((): { location: SourceLocation, basePath?: string } | undefined => {
  for (const entry of entries.value) {
    const details = entry.details
    const location = details?.queries.find(query => query.callSite)?.callSite
      ?? details?.logs.find(log => log.callSite)?.callSite
    if (details && location) {
      return { location, basePath: details.basePath }
    }
  }
  return undefined
})

const detectedRoot = computed(() => entries.value.find(entry => entry.details?.basePath)?.details?.basePath)

const resolve = (location: SourceLocation | undefined) => editorTarget(location, {
  settings: settings.value,
  options: lens.options.editor,
  basePath: sample.value?.basePath,
  launcher,
})
const sampleTarget = computed(() => resolve(sample.value?.location))

/** Why the example has no target, in the order the user would fix it. */
const problem = computed(() => {
  if (usesCommand.value && !launcher) {
    return 'Commands need the dev-server launcher (nuxt dev).'
  }
  if (settings.value.editor === CUSTOM_EDITOR && !settings.value.binary.trim()) {
    return 'Enter the binary to run.'
  }
  return 'The path is relative and no project root is known: set one under Path mapping.'
})

const launcherRefusal = ref<string>()
watch(usesCommand, async (command) => {
  launcherRefusal.value = command && launcher ? await lens.probeEditorLauncher() : undefined
}, { immediate: true })

const launchError = ref<string>()
provide(SOURCE_LINKS, {
  target: resolve,
  launch: (command) => {
    launchError.value = undefined
    lens.launchEditor(command).catch((error: unknown) => {
      launchError.value = error instanceof Error ? error.message : String(error)
    })
  },
})

function describe(target: EditorTarget): string {
  if (target.kind === 'url') {
    return target.url
  }
  return [target.binary, ...target.args].map(part => (/\s/.test(part) ? `"${part}"` : part)).join(' ')
}
</script>
