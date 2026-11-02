import { openPdfFile, openSamplePdf, state } from '@/stores/editor'
import { pickPdfFile } from './useFilePicker'
import { toast } from './useToast'
import { t } from '@/i18n'

export function loadErrorMessage(): string {
  if (!state.loadErrorKey) return ''
  return t(state.loadErrorKey, { msg: state.loadErrorDetail })
}

export async function openFiles(files: FileList | File[] | null): Promise<boolean> {
  const file = files?.[0]
  if (!file) return false
  const ok = await openPdfFile(file)
  if (!ok) {
    const message = loadErrorMessage()
    if (message) toast(message, 'error', 5000)
  }
  return ok
}

export function openFromPicker() {
  pickPdfFile((file) => {
    void openFiles([file])
  })
}

export async function loadSamplePdf(): Promise<boolean> {
  const ok = await openSamplePdf()
  if (!ok) {
    const message = loadErrorMessage()
    if (message) toast(message, 'error', 5000)
  }
  return ok
}
