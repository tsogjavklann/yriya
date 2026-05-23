import { getToken, addUsageSeconds } from '../store'
import type { TokenTestResult } from '../../shared/types'

/**
 * Chimege STT-Long API клиент.
 *
 * Хэрэглэгчийн token нь «Монгол STT-Long» бүтээгдэхүүнд зориулагдсан тул
 * богино /transcribe endpoint биш, асинхрон stt-long урсгалыг ашиглана:
 *   1. POST /stt-long             → аудио илгээж UUID авна
 *   2. GET  /stt-long-transcript  → UUID-аар done болтол давтан асууна
 */
const BASE = 'https://api.chimege.com/v1.2'
const SUBMIT_URL = `${BASE}/stt-long`
const TRANSCRIPT_URL = `${BASE}/stt-long-transcript`

/**
 * Хөрвүүлэлт бэлэн болохыг асуух давталт. Эхэндээ хурдан асууж богино
 * өгүүлбэрийн хариуг шуурхай авна; дараа нь интервалыг сийрэгжүүлж серверийг
 * чалхгүй ачаална. Нийт хүлээх дээд хязгаар ≈ 60 сек.
 */
const POLL_DELAYS_MS = [280, 380, 520, 700, 900, 1100]
const POLL_INTERVAL_MAX_MS = 1200
const POLL_MAX_ATTEMPTS = 53

/** attempt дугаарт харгалзах хүлээх хугацаа (мс). */
function pollDelay(attempt: number): number {
  return POLL_DELAYS_MS[attempt - 1] ?? POLL_INTERVAL_MAX_MS
}

export class ChimegeError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ChimegeError'
  }
}

interface TranscriptItem {
  done: boolean
  transcription?: string
  duration?: number
}

/** AbortController-ээр цуцлагдсан хүсэлтийн алдаа эсэхийг шалгана. */
function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}

/**
 * WAV (16kHz, mono, 16-bit PCM) аудиог STT-Long руу илгээж, танигдсан
 * текстийг буцаана. Аудио илгээх + хариу хүлээх хоёрыг дотроо гүйцэтгэнэ.
 * `signal` дамжуулбал хэрэглэгч цуцлах үед хүсэлтийг шууд тасална.
 * (STT-Long API цэг таслалын параметр дэмждэггүй.)
 */
export async function transcribe(wav: ArrayBuffer, signal?: AbortSignal): Promise<string> {
  const token = getToken()
  if (!token) throw new ChimegeError(0, 'NO_TOKEN')

  const uuid = await submitAudio(wav, token, signal)
  return pollTranscript(uuid, token, signal)
}

/** Аудио илгээж UUID авна. 503 болон сүлжээний алдаанд 3 удаа дахин оролдоно. */
async function submitAudio(
  wav: ArrayBuffer,
  token: string,
  signal?: AbortSignal
): Promise<string> {
  const maxAttempts = 3
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(SUBMIT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          Token: token
        },
        body: wav,
        signal
      })

      if (res.status === 200) {
        const data = (await res.json().catch(() => null)) as
          | { uuid?: string; duration?: number }
          | null
        if (data && typeof data.uuid === 'string' && data.uuid) {
          if (typeof data.duration === 'number') addUsageSeconds(data.duration)
          return data.uuid
        }
        throw new ChimegeError(200, 'Серверээс UUID ирсэнгүй')
      }

      const body = await res.text().catch(() => '')
      if (res.status === 503 && attempt < maxAttempts) {
        await delay(500 * attempt, signal)
        continue
      }
      throw new ChimegeError(res.status, mapError(res.status, body))
    } catch (e) {
      // Цуцлагдсан бол дахин оролдохгүй — шууд таслана.
      if (isAbortError(e)) throw e
      if (e instanceof ChimegeError) throw e
      lastError = e
      if (attempt < maxAttempts) {
        await delay(400 * attempt, signal)
        continue
      }
    }
  }

  throw new ChimegeError(0, `Сүлжээний алдаа: ${String(lastError)}`)
}

/** UUID-аар хөрвүүлэлт дуустал давтан асууж, танигдсан текстийг буцаана. */
async function pollTranscript(
  uuid: string,
  token: string,
  signal?: AbortSignal
): Promise<string> {
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    await delay(pollDelay(attempt), signal)
    try {
      const res = await fetch(TRANSCRIPT_URL, {
        method: 'GET',
        headers: { Token: token, UUID: uuid },
        signal
      })

      if (res.status === 200) {
        const parsed = (await res.json().catch(() => null)) as
          | TranscriptItem
          | TranscriptItem[]
          | null
        const item = Array.isArray(parsed) ? parsed[0] : parsed
        if (item && item.done) {
          const text = (item.transcription ?? '').trim()
          // STT-Long нь чимээгүй/танигдаагүй сегментэд англиар алдаа буцаадаг
          // (ж: "can't transcribe!, file error?"). Жинхэнэ хариу нь үргэлж
          // кирилл үсэгтэй тул кирилл үсэггүй текстийг хоосон гэж үзнэ.
          if (text && !/[Ѐ-ӿ]/i.test(text)) return ''
          return text
        }
        continue // done:false — хөрвүүлэлт үргэлжилж байна
      }
      if (res.status === 503) continue // сервер ачаалалтай — дахин асууна

      const body = await res.text().catch(() => '')
      throw new ChimegeError(res.status, mapError(res.status, body))
    } catch (e) {
      // Цуцлагдсан бол давталтыг шууд таслана.
      if (isAbortError(e)) throw e
      if (e instanceof ChimegeError) throw e
      // сүлжээ түр тасарсан байж магадгүй — дахин оролдоно
      continue
    }
  }

  throw new ChimegeError(0, 'Хөрвүүлэлт хэт удлаа — дахин оролдоно уу')
}

function mapError(status: number, body: string): string {
  const reason = body.trim()
  switch (status) {
    case 400:
      return `Аудио буруу байна (400)${reason ? ': ' + reason.slice(0, 120) : ''}`
    case 403:
      return `Token хүчингүй (403)${reason ? ': «' + reason.slice(0, 120) + '»' : ''} — Тохиргооноос шалгана уу`
    case 404:
      return 'Хөрвүүлэлт олдсонгүй (404)'
    case 500:
      return 'Chimege серверийн алдаа (500)'
    case 503:
      return 'Chimege сервер ачаалалтай байна (503)'
    default:
      return `Алдаа ${status}${reason ? ': ' + reason.slice(0, 120) : ''}`
  }
}

/** setTimeout-д суурилсан delay — `signal` цуцлагдвал шууд reject хийнэ. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Хадгалсан token-ийг шалгана. /stt-long-transcript руу хуурамч UUID-аар
 * GET хүсэлт илгээнэ — token буруу бол 403, зөв бол 404 («uuid олдсонгүй»)
 * буцаана. Энэ нь аудио quota огт зарцуулахгүй.
 */
export async function testToken(): Promise<TokenTestResult> {
  const token = getToken()
  if (!token) {
    return { ok: false, status: 0, message: 'Token оруулаагүй байна' }
  }
  try {
    const res = await fetch(TRANSCRIPT_URL, {
      method: 'GET',
      headers: {
        Token: token,
        UUID: '00000000-0000-0000-0000-000000000000'
      }
    })
    const body = (await res.text().catch(() => '')).trim()
    if (res.status === 403) {
      return {
        ok: false,
        status: 403,
        message: `Token-ийг Chimege татгалзлаа (403)${
          body ? ': «' + body.slice(0, 120) + '»' : ''
        }. console.chimege.com дээрх token идэвхтэй эсэхийг шалгана уу.`
      }
    }
    // 403-аас бусад бүх хариу (404 г.м.) = token хүлээн зөвшөөрөгдсөн
    return { ok: true, status: res.status, message: 'Token хүчинтэй — холболт амжилттай' }
  } catch (e) {
    return { ok: false, status: 0, message: `Сүлжээнд холбогдож чадсангүй: ${String(e)}` }
  }
}
