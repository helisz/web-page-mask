import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}

export function round(value: number, digits = 0) {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

export function formatInt(value: number) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${round(bytes / 1024 ** i, i === 0 ? 0 : 1)} ${units[i]}`
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function baseName(name: string) {
  return name.replace(/\.pdf$/i, '').trim() || 'document'
}

export function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim() || 'document'
}

/** Parse "1-3, 5, 8-" style page ranges against a max page count. */
export function parsePageRange(input: string, total: number): number[] | null {
  const text = input.trim()
  if (!text) return null
  const pages = new Set<number>()
  for (const chunk of text.split(/[,，\s]+/).filter(Boolean)) {
    const match = chunk.match(/^(\d+)(?:\s*[-~–]\s*(\d+))?$/)
    if (!match) return null
    const from = Number(match[1])
    const to = match[2] ? Number(match[2]) : from
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null
    const start = Math.max(1, Math.min(from, to))
    const end = Math.min(total, Math.max(from, to))
    if (start > total || end < 1) continue
    for (let p = start; p <= end; p++) pages.add(p)
  }
  if (!pages.size) return null
  return [...pages].sort((a, b) => a - b)
}
