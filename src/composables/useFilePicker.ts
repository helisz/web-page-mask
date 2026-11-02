let input: HTMLInputElement | null = null
let handler: ((file: File) => void) | null = null

/** Open the OS file picker for PDFs, reusing a single hidden input. */
export function pickPdfFile(callback: (file: File) => void) {
  if (!input) {
    input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/pdf,.pdf'
    input.style.position = 'fixed'
    input.style.width = '1px'
    input.style.height = '1px'
    input.style.opacity = '0'
    input.style.pointerEvents = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      const file = input?.files?.[0]
      if (input) input.value = ''
      if (file) handler?.(file)
    })
  }
  handler = callback
  input.click()
}
