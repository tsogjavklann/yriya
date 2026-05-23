/**
 * Энерги-суурьт Voice Activity Detection (VAD).
 * RMS энергиэр яриаг илрүүлж, чимээгүй завсраар өгүүлбэр болгон тасална.
 * Chimege-д жинхэнэ streaming байхгүй тул өгүүлбэр бүрийг тусад нь илгээнэ.
 */
export interface VadOptions {
  sampleRate: number
  /** RMS энергийн босго (0..1). Бага = илүү мэдрэмтгий */
  threshold: number
  /** Өгүүлбэрийг дуусгахад шаардагдах чимээгүй хугацаа (мс) */
  silenceMs: number
  /** Яриа эхлэхээс өмнө хадгалах аудио (мс) — эхний үеийг тасрахаас сэргийлнэ */
  preRollMs: number
  /** Үүнээс богино яриаг (шуугиан) үл тоомсорлоно (мс) */
  minSpeechMs: number
  /** Сегментийн дээд хязгаар (мс) */
  maxSegmentMs: number
  /** true бол завсарлахад сегмент таслахгүй — зөвхөн end()-д (гараар зогсооход) илгээнэ */
  continuous: boolean
}

export class EnergyVad {
  private opts: VadOptions
  private speaking = false
  private buf: Float32Array[] = []
  private preRoll: Float32Array[] = []
  private preRollSamples = 0
  private segmentSamples = 0
  private speechSamples = 0
  private silenceSamples = 0

  onSegment: (samples: Float32Array) => void = () => {}
  onActivity: (speaking: boolean) => void = () => {}

  constructor(opts: VadOptions) {
    this.opts = opts
  }

  /** RMS энергийн босгыг шинэчлэх — автомат калибрацийн дараа дуудагдана. */
  setThreshold(threshold: number): void {
    this.opts.threshold = threshold
  }

  /** Аудио frame бүрийг боловсруулна. */
  process(frame: Float32Array): void {
    const { sampleRate } = this.opts
    const rms = computeRms(frame)
    const isLoud = rms >= this.opts.threshold
    const silenceLimit = (this.opts.silenceMs / 1000) * sampleRate
    const preRollLimit = (this.opts.preRollMs / 1000) * sampleRate
    const maxSegment = (this.opts.maxSegmentMs / 1000) * sampleRate
    const minSpeech = (this.opts.minSpeechMs / 1000) * sampleRate

    if (!this.speaking) {
      // яриа эхлэхээс өмнөх rolling буфер
      this.preRoll.push(frame)
      this.preRollSamples += frame.length
      while (this.preRollSamples > preRollLimit && this.preRoll.length > 1) {
        this.preRollSamples -= this.preRoll.shift()!.length
      }
      if (isLoud) {
        this.speaking = true
        this.buf = this.preRoll.slice()
        this.segmentSamples = this.preRollSamples
        this.speechSamples = 0
        this.silenceSamples = 0
        this.preRoll = []
        this.preRollSamples = 0
        this.onActivity(true)
      }
      return
    }

    // яриалж байгаа үе
    this.buf.push(frame)
    this.segmentSamples += frame.length
    if (isLoud) {
      this.speechSamples += frame.length
      this.silenceSamples = 0
    } else {
      this.silenceSamples += frame.length
    }

    if (this.segmentSamples >= maxSegment) {
      this.flush(minSpeech)
      return
    }
    // Тасралтгүй горимд завсарлалаар таслахгүй — зөвхөн end() сегментийг илгээнэ.
    if (!this.opts.continuous && this.silenceSamples >= silenceLimit) {
      this.flush(minSpeech)
    }
  }

  /** Session дуусахад дуусаагүй сегментийг хүчээр илгээнэ. */
  end(): void {
    if (this.speaking) this.flush(0)
  }

  private flush(minSpeech: number): void {
    const samples = concat(this.buf, this.segmentSamples)
    const hadSpeech = this.speechSamples >= minSpeech
    this.speaking = false
    this.buf = []
    this.segmentSamples = 0
    this.speechSamples = 0
    this.silenceSamples = 0
    this.onActivity(false)
    if (hadSpeech && samples.length > 0) this.onSegment(samples)
  }
}

function computeRms(frame: Float32Array): number {
  let sum = 0
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
  return Math.sqrt(sum / frame.length)
}

function concat(chunks: Float32Array[], total: number): Float32Array {
  const out = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}
