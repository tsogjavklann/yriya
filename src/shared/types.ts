/** Main болон renderer process-ийн хооронд хуваалцах төрлүүд. */

export type SessionState =
  | 'idle'
  | 'listening'
  | 'speech'
  | 'transcribing'
  | 'error'

export type InjectMode = 'paste' | 'type'

/**
 * Транскрипцийн горим:
 * - fast    — зөвхөн Chimege (монгол, хурдан, нэмэлт зардалгүй)
 * - premium — Chimege + gpt-4o-mini-transcribe + gpt-5.4-mini нэгтгэлт
 * - high    — Chimege + gpt-4o-transcribe + gpt-5.4-mini нэгтгэлт
 */
export type TranscriptionMode = 'fast' | 'premium' | 'high'

/** Хэрэглэгчийн тохиргоо (token-оос бусад — token нь шифрлэгдэж тусдаа хадгалагдана). */
export interface Settings {
  /** Электрон accelerator, ж: "CommandOrControl+Shift+Space" */
  hotkey: string
  /** Компьютер асах үед Yriya-г автоматаар эхлүүлэх эсэх (суулгасан аппд) */
  launchAtLogin: boolean
  /** Транскрипцийн горим */
  transcriptionMode: TranscriptionMode
  /** Хэрэглэгчийн нэмсэн нэр томьёо (англи/программчлал/бренд үгс) */
  customVocabulary: string[]
  /** Текстийг идэвхтэй цонхны cursor байрлалд автоматаар оруулах эсэх */
  autoInject: boolean
  /** paste = clipboard+Ctrl+V, type = тэмдэгт тус бүрээр шивэх */
  injectMode: InjectMode
  /** Сегмент бүрийн ард зай нэмэх */
  trailingSpace: boolean
  /** Өгүүлбэрийн эхний үсгийг том болгох (Chimege зөвхөн жижиг үсэг буцаадаг) */
  autoCapitalize: boolean
  /** Микрофон төхөөрөмжийн ID. '' = default */
  microphoneId: string
  /** VAD-ийн RMS энергийн босго (0..1). Бага = мэдрэмтгий */
  vadThreshold: number
  /** true бол session эхлэх бүрд орчны шуугианд тааруулж босгыг автоматаар тохируулна */
  autoCalibrate: boolean
  /** Өгүүлбэрийг тасалж илгээхэд шаардагдах чимээгүй завсар (мс) */
  silenceMs: number
  /** true бол завсарлахад тасрахгүй — текстийг зөвхөн гараар зогсооход илгээнэ */
  continuousRecording: boolean
  /** Overlay товчны дэлгэц дээрх байрлал (-1 = доод төвд автоматаар) */
  overlayX: number
  overlayY: number
}

export const DEFAULT_SETTINGS: Settings = {
  hotkey: 'CommandOrControl+Shift+Space',
  launchAtLogin: true,
  transcriptionMode: 'premium',
  customVocabulary: [],
  autoInject: true,
  injectMode: 'paste',
  trailingSpace: true,
  autoCapitalize: true,
  microphoneId: '',
  vadThreshold: 0.02,
  autoCalibrate: true,
  silenceMs: 1300,
  continuousRecording: true,
  overlayX: -1,
  overlayY: -1
}

/** Main process-ээс overlay руу илгээх төлвийн мэдээлэл. */
export interface OverlayStatus {
  state: SessionState
  /** Алдаа эсвэл нэмэлт мэдээлэл */
  message?: string
  /** Хамгийн сүүлд танигдсан текст */
  lastText?: string
}

/** Chimege token шалгалтын үр дүн. */
export interface TokenTestResult {
  ok: boolean
  status: number
  message: string
}
