import { globalShortcut } from 'electron'

let current = ''

/**
 * Глобал hotkey бүртгэнэ. Өмнөх бүртгэлийг автоматаар цуцална.
 * Амжилттай бол true буцаана.
 */
export function registerHotkey(accelerator: string, onTrigger: () => void): boolean {
  unregisterHotkey()
  if (!accelerator) return false
  try {
    const ok = globalShortcut.register(accelerator, onTrigger)
    if (ok) current = accelerator
    return ok
  } catch (e) {
    console.error('[hotkey] бүртгэхэд алдаа:', e)
    return false
  }
}

export function unregisterHotkey(): void {
  if (current) {
    try {
      globalShortcut.unregister(current)
    } catch {
      /* ignore */
    }
    current = ''
  }
}
