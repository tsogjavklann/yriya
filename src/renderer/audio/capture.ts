import { EnergyVad } from './vad'
import { encodeWav } from './wav'
import type { Settings } from '../../shared/types'

/** Chimege-ийн стандарт оролт: 16kHz mono. */
const SAMPLE_RATE = 16000
/** ScriptProcessor frame хэмжээ (1024 / 16000 ≈ 64мс) */
const FRAME_SIZE = 1024

let audioCtx: AudioContext | null = null
let stream: MediaStream | null = null
let source: MediaStreamAudioSourceNode | null = null
let processor: ScriptProcessorNode | null = null
let vad: EnergyVad | null = null
let running = false

export interface CaptureCallbacks {
  /** VAD өгүүлбэр таслахад WAV (16kHz/mono/16-bit) буфер */
  onSegmentWav: (wav: ArrayBuffer) => void
  /** Яриа эхэлсэн / зогссон */
  onActivity: (speaking: boolean) => void
  /** Микрофоны одоогийн RMS түвшин (визуализацид) */
  onLevel: (rms: number) => void
  /** Микрофоны алдаа */
  onError: (message: string) => void
}

export async function startCapture(settings: Settings, cb: CaptureCallbacks): Promise<void> {
  if (running) return
  running = true
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: settings.microphoneId ? { exact: settings.microphoneId } : undefined,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE })
    if (audioCtx.state === 'suspended') await audioCtx.resume()
    const sr = audioCtx.sampleRate

    source = audioCtx.createMediaStreamSource(stream)
    processor = audioCtx.createScriptProcessor(FRAME_SIZE, 1, 1)

    const continuous = settings.continuousRecording
    vad = new EnergyVad({
      sampleRate: sr,
      threshold: settings.vadThreshold,
      silenceMs: settings.silenceMs,
      preRollMs: 250,
      minSpeechMs: 250,
      // Тасралтгүй горимд урт хязгаар (5 мин) — зөвхөн санах ойн хамгаалалт.
      maxSegmentMs: continuous ? 300000 : 13000,
      continuous
    })
    vad.onActivity = cb.onActivity
    vad.onSegment = (samples) => cb.onSegmentWav(encodeWav(samples, sr))

    // Автомат калибраци: эхний ~600мс-ийн орчны шуугааныг хэмжиж VAD-ийн
    // босгыг автоматаар тохируулна. Энэ хугацаанд frame-ийг VAD-д өгөхгүй.
    const frameMs = (FRAME_SIZE / sr) * 1000
    let calibrationFrames = settings.autoCalibrate ? Math.ceil(600 / frameMs) : 0
    const noiseLevels: number[] = []

    processor.onaudioprocess = (e: AudioProcessingEvent): void => {
      const input = e.inputBuffer.getChannelData(0)
      const frame = new Float32Array(input.length)
      frame.set(input)
      const level = rms(frame)
      cb.onLevel(level)
      if (calibrationFrames > 0) {
        noiseLevels.push(level)
        calibrationFrames--
        if (calibrationFrames === 0) vad?.setThreshold(thresholdFromNoise(noiseLevels))
        return
      }
      vad?.process(frame)
    }

    // ScriptProcessor нь destination-д холбогдсон үед л ажилладаг.
    // outputBuffer-ийг бид бичихгүй тул чимээ сонсогдохгүй.
    source.connect(processor)
    processor.connect(audioCtx.destination)
  } catch (e) {
    running = false
    await stopCapture()
    cb.onError(describeMicError(e))
  }
}

/**
 * Микрофон барихыг зогсооно.
 * @param flush true (хэвийн зогсолт) бол VAD-ийн дуусаагүй сегментийг
 *   хүчээр илгээнэ; false (цуцлалт) бол сегментийг хаяж текст оруулахгүй.
 */
export async function stopCapture(flush = true): Promise<void> {
  running = false
  try {
    if (flush) vad?.end()
  } catch {
    /* ignore */
  }
  vad = null
  if (processor) {
    processor.onaudioprocess = null
    processor.disconnect()
    processor = null
  }
  if (source) {
    source.disconnect()
    source = null
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
  }
  if (audioCtx) {
    await audioCtx.close().catch(() => {})
    audioCtx = null
  }
}

function rms(frame: Float32Array): number {
  let sum = 0
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
  return Math.sqrt(sum / frame.length)
}

/**
 * Калибрацийн үед хэмжсэн RMS дээжүүдээс VAD-ийн босгыг тооцоолно.
 * Санамсаргүй чанга дуу (хаалга, ярианы эхлэл) дээжийг хасаад орчны
 * шуугианы 75-р хувийн утгыг авч, түүнээс дээгүүр зохистой босго гаргана.
 */
function thresholdFromNoise(levels: number[]): number {
  const quiet = levels.filter((l) => l < 0.045)
  // Ихэнх дээж чанга бол найдвартай тооцоо гарахгүй — анхны утга руу шилжинэ.
  if (quiet.length < 3) return 0.02
  quiet.sort((a, b) => a - b)
  const floor = quiet[Math.floor(quiet.length * 0.75)]
  const threshold = floor * 2.2 + 0.006
  return Math.min(0.05, Math.max(0.012, threshold))
}

function describeMicError(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Микрофон ашиглах зөвшөөрөл өгөгдөөгүй'
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'Микрофон олдсонгүй'
  if (name === 'NotReadableError') return 'Микрофон өөр программд ашиглагдаж байна'
  return `Микрофоны алдаа: ${String((e as Error)?.message ?? e)}`
}
