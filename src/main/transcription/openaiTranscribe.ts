import OpenAI, { toFile } from 'openai'
import { getOpenaiKey } from '../store'
import type { TokenTestResult } from '../../shared/types'

/** Premium = gpt-4o-mini-transcribe, High Accuracy = gpt-4o-transcribe. */
export type OpenAiAudioModel = 'gpt-4o-mini-transcribe' | 'gpt-4o-transcribe'

/** Шинэ key орох бүрд шинэ client (key UI-аас өөрчлөгдөж болно). */
function client(): OpenAI {
  const apiKey = getOpenaiKey()
  if (!apiKey) throw new Error('OpenAI API key тохируулаагүй байна')
  return new OpenAI({ apiKey })
}

const BASE_PROMPT = `
The speaker mixes Mongolian and English in everyday dictation.
Transcribe exactly what is spoken.
Write Mongolian words in Mongolian Cyrillic.
Write ALL foreign-origin words in Latin letters — never transliterate them into Cyrillic.
This includes English loanwords used in daily Mongolian speech: meeting, presentation, project, deadline, design, modern, email, assignment, idea, class, laptop, song, vibe, style, plan, app, file, group, option, budget, busy, stress, creative, premium, schedule, unique, link, phone, content, version, team, teamwork, coffee, etc.
Also includes brand names, app names, product names, and programming terms.
Preserve Mongolian case/possessive suffixes attached to foreign words using a hyphen:
"meeting-д", "presentation-аа", "email-ээ", "deadline-аасаа", "laptop-оо", "link-ийг", "budget-ээ".
Never write a foreign word + Mongolian suffix as a single Cyrillic blob (e.g. NOT "митингд", "презентэйшнээ", "имэйлээ").
Do not translate. Do not invent words.

Common foreign terms:
React, component, API, response, request, backend, frontend, Electron,
TypeScript, JavaScript, Next.js, Supabase, Firebase, GitHub, Figma,
Whisper Flow, Wispr Flow, Chimege, OpenAI, ChatGPT, Claude Code,
meeting, presentation, project, deadline, design, modern, email,
assignment, idea, class, laptop, song, vibe, style, plan, app, file,
group, option, budget, busy, stress, creative, premium, schedule,
unique, link, phone, content, version, team, teamwork, coffee.
`.trim()

/**
 * WAV аудиог OpenAI audio.transcriptions руу илгээж танигдсан текстийг буцаана.
 * Хэлийг тусгайлан зааж өгөхгүй — холимог хэлийг автоматаар таниулна.
 * `signal` дамжуулбал хэрэглэгч цуцлах үед хүсэлтийг шууд тасална.
 */
export async function transcribeWithOpenAI(
  wav: ArrayBuffer,
  model: OpenAiAudioModel,
  vocab: string[] = [],
  signal?: AbortSignal
): Promise<string> {
  const file = await toFile(Buffer.from(wav), 'audio.wav', { type: 'audio/wav' })
  const prompt = vocab.length
    ? `${BASE_PROMPT}\n\nAdditional terms: ${vocab.join(', ')}`
    : BASE_PROMPT

  const result = await client().audio.transcriptions.create(
    {
      file,
      model,
      response_format: 'json',
      temperature: 0,
      prompt
    },
    { signal }
  )

  return result.text?.trim() ?? ''
}

/**
 * Хадгалсан OpenAI API key-ийг шалгана. models.list() дуудалт — key буруу
 * бол 401, зөв бол амжилттай. Аудио хөрвүүлэлтийн төлбөр гаргахгүй.
 */
export async function testKey(): Promise<TokenTestResult> {
  const key = getOpenaiKey()
  if (!key) {
    return { ok: false, status: 0, message: 'OpenAI API key оруулаагүй байна' }
  }
  try {
    await new OpenAI({ apiKey: key }).models.list()
    return { ok: true, status: 200, message: 'OpenAI key хүчинтэй — холболт амжилттай' }
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 0
    if (status === 401) {
      return {
        ok: false,
        status: 401,
        message: 'OpenAI key буруу (401). platform.openai.com дээрх key-гээ шалгана уу.'
      }
    }
    return {
      ok: false,
      status,
      message: `Холбогдож чадсангүй: ${String((e as Error)?.message ?? e)}`
    }
  }
}
