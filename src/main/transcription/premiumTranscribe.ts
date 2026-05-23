import { transcribe as transcribeWithChimege } from './chimege'
import { transcribeWithOpenAI, type OpenAiAudioModel } from './openaiTranscribe'
import { mergeTranscripts } from './mergeTranscripts'
import { isDev } from '../dev'

/** Үндсэн глоссари — нэр томьёо, бренд, программчлалын үгс. */
const DEFAULT_GLOSSARY = [
  'React',
  'component',
  'API',
  'response',
  'request',
  'backend',
  'frontend',
  'Electron',
  'TypeScript',
  'JavaScript',
  'Next.js',
  'Supabase',
  'Firebase',
  'GitHub',
  'Figma',
  'Whisper Flow',
  'Wispr Flow',
  'Chimege',
  'OpenAI',
  'ChatGPT',
  'Claude Code'
]

/** premiumTranscribe-ийн үр дүн — debug талбаруудтай. */
export interface TranscriptionResult {
  /** Бодит явсан зам: premium-mixed | chimege-correction-fallback | openai-fallback */
  mode: string
  /** Эцсийн текст — cursor байрлалд оруулна. */
  text: string
  chimegeText: string
  openaiText: string
}

/**
 * Premium Mixed транскрипц.
 * Chimege болон OpenAI-г зэрэг ажиллуулж, дараа нь LLM-ээр нэгтгэнэ.
 * Аль нэг нь унавал нөгөөгөөр нь, merge унавал хамгийн сайн түүхийгээр нь
 * найдвартай fallback хийнэ. `signal` дамжуулбал цуцлахад бүх хүсэлт тасарна.
 */
export async function premiumTranscribe(
  wav: ArrayBuffer,
  audioModel: OpenAiAudioModel,
  customVocab: string[] = [],
  signal?: AbortSignal
): Promise<TranscriptionResult> {
  const glossary = [...DEFAULT_GLOSSARY, ...customVocab]

  // Хоёр хөдөлгүүрийг зэрэг ажиллуулна (Promise.allSettled — аль нь ч унаж болно).
  const [chimegeRes, openaiRes] = await Promise.allSettled([
    transcribeWithChimege(wav, signal),
    transcribeWithOpenAI(wav, audioModel, glossary, signal)
  ])

  const chimegeText = chimegeRes.status === 'fulfilled' ? chimegeRes.value.trim() : ''
  const openaiText = openaiRes.status === 'fulfilled' ? openaiRes.value.trim() : ''

  if (isDev()) {
    if (chimegeRes.status === 'rejected') console.warn('[premium] Chimege алдаа:', chimegeRes.reason)
    if (openaiRes.status === 'rejected') console.warn('[premium] OpenAI алдаа:', openaiRes.reason)
  }

  // Хэрэглэгч цуцалсан бол алдаа гэж бус, цуцлалт гэж дамжуулна.
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  if (!chimegeText && !openaiText) {
    throw new Error('Chimege болон OpenAI хоёулаа амжилтгүй боллоо')
  }

  // Зөвхөн OpenAI амжилттай — шууд буцаана (нэгтгэх юм байхгүй).
  if (!chimegeText) {
    return result('openai-fallback', chimegeText, openaiText, openaiText)
  }

  // Зөвхөн Chimege амжилттай — merge-ээр зөвхөн цэвэрлэнэ (filler устгах).
  if (!openaiText) {
    const finalText = await safeMerge(chimegeText, '', glossary, chimegeText, signal)
    return result('chimege-correction-fallback', chimegeText, openaiText, finalText)
  }

  // Хоёулаа амжилттай — бүрэн нэгтгэлт.
  const finalText = await safeMerge(chimegeText, openaiText, glossary, openaiText, signal)
  return result('premium-mixed', chimegeText, openaiText, finalText)
}

/** Merge хийж үзээд унавал найдвартай fallback текст рүү шилжинэ. */
async function safeMerge(
  chimegeText: string,
  openaiText: string,
  glossary: string[],
  fallback: string,
  signal?: AbortSignal
): Promise<string> {
  try {
    const merged = await mergeTranscripts({ chimegeText, openaiText, glossary }, signal)
    return merged || fallback
  } catch (e) {
    // Цуцлалтыг fallback болгож залгихгүй — дээш дамжуулна.
    if (e instanceof Error && e.name === 'AbortError') throw e
    if (isDev()) console.warn('[premium] merge амжилтгүй, fallback ашиглав:', e)
    return fallback
  }
}

function result(
  mode: string,
  chimegeText: string,
  openaiText: string,
  text: string
): TranscriptionResult {
  if (isDev()) {
    console.log('[premium] result', { mode, chimegeText, openaiText, finalText: text })
  }
  return { mode, text, chimegeText, openaiText }
}
