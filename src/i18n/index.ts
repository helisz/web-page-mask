import { messages, type MessageKey } from './messages'
import { state } from '@/stores/editor'

export type { MessageKey }

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const dict = messages[state.locale] ?? messages['zh-CN']
  let text: string = dict[key] ?? messages['zh-CN'][key] ?? key
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value))
    }
  }
  return text
}
