import { openDocument, openSamplePdf, state } from '@/stores/editor'
import { pickFiles } from './useFilePicker'
import { toast } from './useToast'
import { t } from '@/i18n'

export function loadErrorMessage(): string {
  if (!state.loadErrorKey) return ''
  return t(state.loadErrorKey, { msg: state.loadErrorDetail, name: state.loadErrorDetail })
}

/** Open whatever the user dropped/picked: one PDF or any number of images. */
export async function openFiles(files: FileList | File[] | null): Promise<boolean> {
  const list = files ? Array.from(files) : []
  if (!list.length) return false
  const ok = await openDocument(list)
  if (!ok) {
    const message = loadErrorMessage()
    if (message) toast(message, 'error', 5000)
  }
  return ok
}

export function openFromPicker() {
  pickFiles((files) => {
    void openFiles(files)
  })
}

export async function loadSample(): Promise<boolean> {
  const ok = await openSamplePdf()
  if (!ok) {
    const message = loadErrorMessage()
    if (message) toast(message, 'error', 5000)
  }
  return ok
}
