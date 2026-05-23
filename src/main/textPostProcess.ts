import type { Settings } from '../shared/types'

const SENTENCE_END = /[.!?…]/

/**
 * Chimege зөвхөн жижиг кирилл үсэг буцаадаг. Текстийг оруулахын өмнө цэгцлэх:
 * илүү зай арилгах, өгүүлбэрийн эхийг том үсгээр эхлүүлэх, төгсгөлд зай нэмэх.
 */
export function postProcess(raw: string, settings: Settings): string {
  let text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return ''

  if (settings.autoCapitalize) {
    text = capitalizeSentences(text)
  }
  if (settings.trailingSpace) {
    text = text + ' '
  }
  return text
}

/** Эхний үсэг ба өгүүлбэр төгсгөх тэмдгийн дараах үсгийг том болгоно. */
function capitalizeSentences(text: string): string {
  let result = ''
  let capitalizeNext = true
  for (const ch of text) {
    if (capitalizeNext && /\p{L}/u.test(ch)) {
      result += ch.toUpperCase()
      capitalizeNext = false
    } else {
      result += ch
      if (SENTENCE_END.test(ch)) capitalizeNext = true
    }
  }
  return result
}
