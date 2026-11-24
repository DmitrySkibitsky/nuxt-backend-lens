<template>
  <a
    v-if="target?.kind === 'url'"
    class="bl-source-link"
    :href="target.url"
    :title="`Open in the editor: ${text}`"
    data-testid="backend-lens-source-link"
    @click.stop
  ><slot>{{ text }}</slot></a>
  <button
    v-else-if="target?.kind === 'command'"
    type="button"
    class="bl-source-link"
    :title="`Open in the editor: ${text}`"
    data-testid="backend-lens-source-link"
    @click.stop="links?.launch(target)"
  >
    <slot>{{ text }}</slot>
  </button>
  <span v-else><slot>{{ text }}</slot></span>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { SourceLocation } from '../core/types'
import { SOURCE_LINKS } from './editor'
import { formatFrame } from './format'

const props = defineProps<{
  location: SourceLocation | undefined
}>()

// Outside request details (a component rendered on its own) there is nothing to open with.
const links = inject(SOURCE_LINKS, undefined)
const target = computed(() => links?.target(props.location))
const text = computed(() => formatFrame(props.location?.file, props.location?.line))
</script>
