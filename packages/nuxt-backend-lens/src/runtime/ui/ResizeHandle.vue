<template>
  <div
    class="bl-resize"
    :class="`bl-resize-${edge}`"
    role="separator"
    tabindex="0"
    :aria-orientation="horizontal ? 'vertical' : 'horizontal'"
    :aria-label="label"
    :aria-valuenow="ariaValue"
    :aria-valuemin="min"
    :aria-valuemax="ariaMax"
    title="Drag to resize, double-click to reset"
    @pointerdown="start"
    @pointermove="move"
    @pointerup="end"
    @pointercancel="end"
    @lostpointercapture="end"
    @dblclick="emit('reset')"
    @keydown="key"
    @focus="measure"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { type Edge, KEYBOARD_STEP, resized } from './layout'

const props = defineProps<{
  edge: Edge
  label: string
  min: number
  /** Rendered size along the handle's axis when a drag starts (CSS limits already applied). */
  size: () => number
  /** Largest size allowed right now (viewport or container). */
  max: () => number
}>()

const emit = defineEmits<{
  resize: [value: number]
  end: []
  reset: []
}>()

const horizontal = computed(() => props.edge === 'left' || props.edge === 'right')
const ariaValue = ref<number>()
const ariaMax = ref<number>()

/** Screen readers announce the size from the start, not only after a drag. */
function measure() {
  ariaValue.value = Math.round(props.size())
  ariaMax.value = Math.round(props.max())
}

onMounted(measure)

let drag: { pointer: number, size: number, max: number } | undefined

const coordinate = (event: PointerEvent) => (horizontal.value ? event.clientX : event.clientY)

function start(event: PointerEvent) {
  if (event.button !== 0) {
    return
  }
  event.preventDefault()
  drag = { pointer: coordinate(event), size: props.size(), max: props.max() }
  ariaMax.value = Math.round(drag.max)
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function move(event: PointerEvent) {
  if (!drag) {
    return
  }
  const value = resized(drag.size, coordinate(event) - drag.pointer, props.edge, props.min, drag.max)
  ariaValue.value = value
  emit('resize', value)
}

function end() {
  if (drag) {
    drag = undefined
    emit('end')
  }
}

const KEY_DELTAS: Record<string, number> = {
  ArrowLeft: -KEYBOARD_STEP,
  ArrowUp: -KEYBOARD_STEP,
  ArrowRight: KEYBOARD_STEP,
  ArrowDown: KEYBOARD_STEP,
}

function key(event: KeyboardEvent) {
  const delta = KEY_DELTAS[event.key]
  const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
  if (delta === undefined || vertical === horizontal.value) {
    return
  }
  event.preventDefault()
  const max = props.max()
  const value = resized(props.size(), delta, props.edge, props.min, max)
  ariaValue.value = value
  ariaMax.value = Math.round(max)
  emit('resize', value)
  emit('end')
}
</script>
