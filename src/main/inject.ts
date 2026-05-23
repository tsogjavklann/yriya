import { clipboard } from 'electron'
import type { Settings } from '../shared/types'

/**
 * Танигдсан текстийг идэвхтэй цонхны cursor байрлалд оруулна.
 * Кирилл/Unicode-д хамгийн найдвартай арга нь clipboard + Ctrl+V тул
 * үндсэн горим нь paste. nut-js ачаалагдаагүй бол clipboard-only руу шилжинэ.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nut: any = null
let nutLoadFailed = false

async function loadNut(): Promise<unknown> {
  if (nut || nutLoadFailed) return nut
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('@nut-tree-fork/nut-js')
    nut = mod.default ?? mod
    nut.keyboard.config.autoDelayMs = 0
    return nut
  } catch (e) {
    console.error('[inject] nut-js ачаалж чадсангүй — clipboard-only горим:', e)
    nutLoadFailed = true
    return null
  }
}

export interface InjectResult {
  /** true = текст идэвхтэй цонхонд бичигдсэн */
  injected: boolean
  /** injected=false үед шалтгаан */
  reason?: string
}

export async function injectText(text: string, settings: Settings): Promise<InjectResult> {
  if (!text) return { injected: false, reason: 'empty' }

  if (!settings.autoInject) {
    clipboard.writeText(text)
    return { injected: false, reason: 'clipboard-only' }
  }

  await loadNut()
  if (!nut) {
    clipboard.writeText(text)
    return { injected: false, reason: 'nut-unavailable' }
  }

  if (settings.injectMode === 'type') {
    try {
      await nut.keyboard.type(text)
      return { injected: true }
    } catch (e) {
      clipboard.writeText(text)
      return { injected: false, reason: `type-failed: ${String(e)}` }
    }
  }

  // paste горим: clipboard-д бичээд Ctrl+V симуляц хийнэ.
  // Анхны clipboard агуулгыг session.ts бүхэл burst-ийн төгсгөлд сэргээнэ.
  try {
    clipboard.writeText(text)
    await delay(25)
    await nut.keyboard.pressKey(nut.Key.LeftControl, nut.Key.V)
    await nut.keyboard.releaseKey(nut.Key.LeftControl, nut.Key.V)
    await delay(120)
    return { injected: true }
  } catch (e) {
    return { injected: false, reason: `paste-failed: ${String(e)}` }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
