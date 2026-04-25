<script setup>
import { useUiStore } from '../stores/ui'

const ui = useUiStore()

const classes = {
  success: 'bg-green-600 text-white',
  error:   'bg-red-500 text-white',
  warning: 'bg-amber-500 text-white',
  info:    'bg-blue-500 text-white',
}
</script>

<template>
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80 pointer-events-none">
    <transition-group name="toast">
      <div
        v-for="t in ui.toasts"
        :key="t.id"
        class="px-4 py-3 rounded-xl shadow-lg text-sm font-medium pointer-events-auto"
        :class="classes[t.type] ?? classes.info"
      >
        {{ t.message }}
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from   { opacity: 0; transform: translateX(110%); }
.toast-leave-to     { opacity: 0; transform: translateX(110%); }
</style>
