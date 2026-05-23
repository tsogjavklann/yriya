import { clipboard, globalShortcut, type BrowserWindow } from 'electron'
import { getSettings } from './store'
import { transcribe as transcribeWithChimege } from './transcription/chimege'
import { premiumTranscribe } from './transcription/premiumTranscribe'
import { postProcess } from './textPostProcess'
import { injectText } from './inject'
import type { OverlayStatus, SessionState } from '../shared/types'

/**
 * Dictation session-ийн state machine. Hotkey, аудио, хөрвүүлэлт, текст
 * оруулалт, overlay-г уялдуулна.
 *
 * Хурд: яриа сегмент ирмэгц хөрвүүлэлтийг ШУУД эхлүүлнэ (дараалалд хүлээлгэхгүй).
 * Олон өгүүлбэрийг зэрэг хөрвүүлж, харин текст оруулалтыг л дарааллаар нь
 * хийснээр оруулалтын дараалал зөв хэвээр, нийт хүлээх хугацаа богиносоно.
 *
 * Цуцлах: хэрэглэгч андуурч ярьсан бол Esc дарж тухайн бичлэгийг бүхэлд нь
 * хаяна — танигдсан текст cursor байрлалд ОРОХГҮЙ, ажиллаж буй хүсэлтүүд тасарна.
 *
 * Overlay товч нь байнга харагдана — энд цонхыг нуудаггүй, зөвхөн төлвийг
 * (idle / listening / speech / transcribing / error) шинэчилнэ.
 */

interface SessionDeps {
  onStateChange: () => void
}

let overlay: BrowserWindow | null = null
let deps: SessionDeps = { onStateChange: () => {} }

let active = false
let state: SessionState = 'idle'
let lastText = ''

/**
 * Тухайн session-ийн дугаар. Цуцлах эсвэл шинээр эхлэх бүрд нэмэгдэнэ.
 * Job бүр өөрийн runId-г хадгалдаг тул цуцлагдсан session-ийн хөрвүүлэлт
 * хожуу дуусахад үр дүнг нь хаяна.
 */
let runId = 0
/** Идэвхтэй session-ийн HTTP хүсэлтүүдийг цуцлах контроллер. */
let abortController: AbortController | null = null

/**
 * Дараалалд буй яриа сегмент. Сегмент ирмэгц `text` (хөрвүүлэлт)-ийг шууд
 * эхлүүлдэг тул хэд хэдэн сегмент зэрэг хөрвүүлэгдэнэ.
 */
interface Job {
  runId: number
  /** Хөрвүүлж, цэгцэлсэн текст. Сегмент дарааллд ормогц шууд эхэлнэ. */
  text: Promise<string>
}
let queue: Job[] = []
let processing = false

export function initSession(overlayWindow: BrowserWindow, d: SessionDeps): void {
  overlay = overlayWindow
  deps = d
}

export function isActive(): boolean {
  return active
}

export function getState(): SessionState {
  return state
}

export function toggleSession(): void {
  if (active) stopSession()
  else startSession()
}

export function startSession(): void {
  if (active) return
  active = true
  runId++
  abortController = new AbortController()
  armCancelKey()
  // Бичлэг эхэлбэл товч заавал харагдаж байх ёстой (төлвөө харуулна).
  if (overlay && !overlay.isDestroyed() && !overlay.isVisible()) {
    overlay.showInactive()
  }
  setState('listening')
  overlay?.webContents.send('audio:start', getSettings())
}

/** Бичлэгийг хэвийн дуусгах — эцсийн сегментийг хөрвүүлж, текстийг оруулна. */
export function stopSession(): void {
  if (!active) return
  active = false
  disarmCancelKey()
  overlay?.webContents.send('audio:stop')
  if (processing || queue.length > 0) {
    setState('transcribing')
  } else {
    setState('idle')
  }
}

/**
 * Бичлэгийг ЦУЦЛАХ — андуурч ярьсныг хаяна. Микрофоныг flush хийлгүй
 * зогсоож, дараалал болон ажиллаж буй хөрвүүлэлтийг бүгдийг хүчингүй болгоно.
 * Танигдсан текст cursor байрлалд ОРОХГҮЙ.
 */
export function cancelSession(): void {
  if (!active && !processing && queue.length === 0) return
  active = false
  runId++ // өмнөх runId-тай бүх job хүчингүй боллоо
  queue = []
  abortController?.abort() // ажиллаж буй HTTP хүсэлтүүдийг шууд тасална
  abortController = null
  disarmCancelKey()
  overlay?.webContents.send('audio:cancel') // flush ХИЙХГҮЙ зогсооно
  setState('idle', 'Бичлэг цуцлагдлаа')
}

/** Renderer-ээс дуусаж ирсэн яриа сегмент (WAV) — хөрвүүлэлтийг шууд эхлүүлнэ. */
export function enqueueSegment(wav: ArrayBuffer): void {
  const signal = abortController?.signal
  const job: Job = {
    runId,
    text: transcribeSegment(wav, signal)
  }
  // Consumer await хийх хүртэлх зуурын unhandled rejection-аас сэргийлнэ.
  job.text.catch(() => {})
  queue.push(job)
  void processQueue()
}

/** Нэг сегментийг сонгосон горимоор хөрвүүлж, цэгцэлсэн текст буцаана. */
async function transcribeSegment(wav: ArrayBuffer, signal?: AbortSignal): Promise<string> {
  const settings = getSettings()
  let raw: string
  if (settings.transcriptionMode === 'fast') {
    raw = await transcribeWithChimege(wav, signal)
  } else {
    const audioModel =
      settings.transcriptionMode === 'high' ? 'gpt-4o-transcribe' : 'gpt-4o-mini-transcribe'
    const tr = await premiumTranscribe(wav, audioModel, settings.customVocabulary, signal)
    raw = tr.text
  }
  return postProcess(raw, settings)
}

/** Renderer-ийн VAD-ийн яриа эхлэх/зогсох. */
export function onSpeechActivity(speaking: boolean): void {
  if (!active || processing) return
  setState(speaking ? 'speech' : 'listening')
}

/** Микрофоны алдаа гарвал session-ийг зогсооно. */
export function reportAudioError(message: string): void {
  active = false
  abortController?.abort()
  abortController = null
  disarmCancelKey()
  overlay?.webContents.send('audio:stop')
  setState('error', message)
}

/**
 * Дараалалд буй job-уудыг дарааллаар нь хүлээж текстийг оруулна.
 * Хөрвүүлэлт өөрөө зэрэгцэн явагддаг — энд зөвхөн оруулалтыг цувуулна.
 */
async function processQueue(): Promise<void> {
  if (processing) return
  processing = true

  // Бүхэл burst-ийн турш анхны clipboard агуулгыг хадгалж, төгсгөлд нь сэргээнэ.
  const savedClipboard = clipboard.readText()
  let didInject = false

  while (queue.length > 0) {
    const job = queue[0]
    setState(
      'transcribing',
      queue.length > 1 ? `+${queue.length - 1} өгүүлбэр дараалалд` : undefined
    )

    let text = ''
    let error: unknown = null
    try {
      text = await job.text
    } catch (e) {
      error = e
    }

    // await хийх явцад session цуцлагдсан бол энэ job-ийн үр дүнг хаяна.
    if (queue[0] !== job) continue // queue цэвэрлэгдсэн (цуцлагдсан)
    queue.shift()
    if (job.runId !== runId) continue // өөр (цуцлагдсан) session — алдааг ч хаяна

    if (error) {
      setState('error', friendlyError(error))
      await delay(2600)
      continue
    }

    const settings = getSettings()
    if (text.trim()) {
      const result = await injectText(text, settings)
      if (result.injected) didInject = true
      lastText = text.trim()
      pushStatus({
        state: active ? 'listening' : 'idle',
        lastText,
        message: result.injected ? undefined : injectNote(result.reason)
      })
    }
  }

  // Cursor-т текст оруулсан тохиолдолд анхны clipboard-ийг буцааж сэргээнэ.
  if (didInject) {
    setTimeout(() => {
      try {
        clipboard.writeText(savedClipboard)
      } catch {
        /* ignore */
      }
    }, 300)
  }

  processing = false
  // Цуцлагдсан үед state аль хэдийн idle — давхар idle тавих нь хор хохиролгүй.
  setState(active ? 'listening' : 'idle')
}

/** Бичлэгийн турш Esc-ийг глобалаар барьж, цуцлах боломжтой болгоно. */
function armCancelKey(): void {
  try {
    globalShortcut.register('Escape', () => cancelSession())
  } catch (e) {
    console.warn('[session] Esc цуцлах товч бүртгэж чадсангүй:', e)
  }
}

function disarmCancelKey(): void {
  try {
    if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape')
  } catch {
    /* ignore */
  }
}

function friendlyError(e: unknown): string {
  if (e instanceof Error) {
    if (e.message === 'NO_TOKEN') return 'Chimege token тохируулаагүй байна'
    return e.message
  }
  return String(e)
}

function injectNote(reason?: string): string {
  switch (reason) {
    case 'clipboard-only':
    case 'nut-unavailable':
      return 'Текст clipboard-д хуулагдлаа — Ctrl+V дарж буулгана уу'
    case 'empty':
      return ''
    default:
      return reason ? `Оруулалт амжилтгүй: ${reason}` : ''
  }
}

function setState(s: SessionState, message?: string): void {
  state = s
  pushStatus({ state: s, message, lastText })
  deps.onStateChange()
}

function pushStatus(status: OverlayStatus): void {
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('overlay:status', status)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
