import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const toasts = ref([])
  let nextId = 0

  function addToast(message, type = 'info', duration = 3500) {
    const id = nextId++
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, duration)
  }

  const success = (msg) => addToast(msg, 'success')
  const error   = (msg) => addToast(msg, 'error', 5000)
  const warning = (msg) => addToast(msg, 'warning')
  const info    = (msg) => addToast(msg, 'info')

  return { toasts, success, error, warning, info }
})
