import { reactive } from 'vue'

export type ToastTone = 'default' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

let nextId = 1

export const toasts = reactive<Toast[]>([])

export function dismissToast(id: number) {
  const index = toasts.findIndex((toast) => toast.id === id)
  if (index !== -1) toasts.splice(index, 1)
}

export function toast(message: string, tone: ToastTone = 'default', duration = 3600) {
  const id = nextId++
  toasts.push({ id, message, tone })
  if (toasts.length > 4) toasts.shift()
  window.setTimeout(() => dismissToast(id), duration)
  return id
}
