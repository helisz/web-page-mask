import { FILE_ACCEPT } from '@/lib/source'

let input: HTMLInputElement | null = null
let handler: ((files: File[]) => void) | null = null

/** Open the OS file picker for PDFs and images, reusing a single hidden input. */
export function pickFiles(callback: (files: File[]) => void) {
  if (!input) {
    input = document.createElement('input')
    input.type = 'file'
    input.accept = FILE_ACCEPT
    input.multiple = true
    input.style.position = 'fixed'
    input.style.width = '1px'
    input.style.height = '1px'
    input.style.opacity = '0'
    input.style.pointerEvents = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      const files = input?.files ? Array.from(input.files) : []
      if (input) input.value = ''
      if (files.length) handler?.(files)
    })
  }
  handler = callback
  input.click()
}
