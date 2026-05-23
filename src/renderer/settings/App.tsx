import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { InjectMode, Settings, TranscriptionMode } from '../../shared/types'

/* ---------- SVG icon-ууд ---------- */
const ICONS: Record<string, ReactNode> = {
  key: (
    <>
      <circle cx="9" cy="15" r="4" />
      <path d="M12 12 20 4M16.5 7.5 19 10M14 10l2.5 2.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </>
  ),
  sparkle: <path d="M12 3l2.2 6.8 6.8 2.2-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />,
  caret: <path d="M12 5v14M8.5 5h7M8.5 19h7" />,
  tune: (
    <>
      <path d="M4 8h16M4 16h16" />
      <circle cx="9" cy="8" r="2.6" />
      <circle cx="15" cy="16" r="2.6" />
    </>
  ),
  power: (
    <>
      <path d="M12 3v9" />
      <path d="M6.6 6.6a8 8 0 1 0 10.8 0" />
    </>
  )
}

function Icon({ name }: { name: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  )
}

/* ---------- Hotkey туслахууд ---------- */
function parseHotkey(acc: string): string[] {
  return acc.split('+').map((k) => {
    if (['CommandOrControl', 'CmdOrCtrl', 'Control', 'Ctrl'].includes(k)) return 'Ctrl'
    if (['Super', 'Meta', 'Cmd', 'Command'].includes(k)) return 'Win'
    if (k === 'Option') return 'Alt'
    return k
  })
}

function mainKeyFromEvent(e: KeyboardEvent): string | null {
  const c = e.code
  if (c === 'Space') return 'Space'
  if (/^Key[A-Z]$/.test(c)) return c.slice(3)
  if (/^Digit[0-9]$/.test(c)) return c.slice(5)
  if (/^F([1-9]|1[0-2])$/.test(c)) return c
  if (c === 'Enter') return 'Return'
  const map: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    Tab: 'Tab'
  }
  return map[c] ?? null
}

/** Хэрэглээний секундийг ойлгомжтой бичвэр болгоно. */
function formatUsage(sec: number): string {
  if (sec <= 0) return '0 сек'
  if (sec < 60) return `${Math.round(sec)} сек`
  const m = Math.floor(sec / 60)
  if (m < 60) {
    const s = Math.round(sec % 60)
    return s ? `${m} мин ${s} сек` : `${m} мин`
  }
  const h = Math.floor(m / 60)
  return `${h} ц ${m % 60} мин`
}

/* ---------- App ---------- */
export default function App(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [hasToken, setHasToken] = useState(false)
  const [maskedToken, setMaskedToken] = useState('')
  const [tokenInput, setTokenInput] = useState('')
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [flash, setFlash] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [hotkeyOk, setHotkeyOk] = useState(true)
  const [usage, setUsage] = useState(0)
  const [conn, setConn] = useState<{
    status: 'idle' | 'testing' | 'ok' | 'fail'
    message: string
  }>({ status: 'idle', message: '' })
  const [openaiHasKey, setOpenaiHasKey] = useState(false)
  const [maskedOpenai, setMaskedOpenai] = useState('')
  const [openaiInput, setOpenaiInput] = useState('')
  const [openaiConn, setOpenaiConn] = useState<{
    status: 'idle' | 'testing' | 'ok' | 'fail'
    message: string
  }>({ status: 'idle', message: '' })
  const [vocabText, setVocabText] = useState('')

  const meterRef = useRef<HTMLDivElement>(null)
  const testCleanup = useRef<(() => void) | null>(null)

  const runTest = useCallback(async () => {
    setConn({ status: 'testing', message: '' })
    const r = await window.yriya.testToken()
    setConn({ status: r.ok ? 'ok' : 'fail', message: r.message })
  }, [])

  const runOpenaiTest = useCallback(async () => {
    setOpenaiConn({ status: 'testing', message: '' })
    const r = await window.yriya.testOpenaiKey()
    setOpenaiConn({ status: r.ok ? 'ok' : 'fail', message: r.message })
  }, [])

  useEffect(() => {
    void (async () => {
      const s = await window.yriya.getSettings()
      setSettings(s)
      setVocabText(s.customVocabulary.join(', '))
      const tok = await window.yriya.getTokenStatus()
      setHasToken(tok)
      setMaskedToken(await window.yriya.getMaskedToken())
      setUsage(await window.yriya.getUsageSeconds())
      if (tok) void runTest()
      const oa = await window.yriya.getOpenaiStatus()
      setOpenaiHasKey(oa)
      setMaskedOpenai(await window.yriya.getMaskedOpenaiKey())
      if (oa) void runOpenaiTest()
    })()
  }, [runTest, runOpenaiTest])

  useEffect(() => {
    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        s.getTracks().forEach((t) => t.stop())
      } catch {
        /* зөвшөөрөл өгөөгүй байж магадгүй */
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        setMics(devices.filter((d) => d.kind === 'audioinput'))
      } catch {
        /* ignore */
      }
    })()
  }, [])

  useEffect(() => () => testCleanup.current?.(), [])

  // Hotkey амжилттай бүртгэгдсэн эсэхийг шалгана (өөр программтай зөрчилдвөл false).
  useEffect(() => {
    if (!settings) return
    void window.yriya.getHotkeyStatus().then(setHotkeyOk)
  }, [settings?.hotkey, settings])

  const showFlash = useCallback((msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(''), 1800)
  }, [])

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      const next = await window.yriya.setSettings(patch)
      setSettings(next)
      showFlash('Хадгалагдлаа ✓')
    },
    [showFlash]
  )

  // hotkey-г шууд барьж авах
  useEffect(() => {
    if (!capturing) return
    const handler = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(false)
        return
      }
      const mods: string[] = []
      if (e.ctrlKey) mods.push('CommandOrControl')
      if (e.altKey) mods.push('Alt')
      if (e.shiftKey) mods.push('Shift')
      if (e.metaKey) mods.push('Super')
      const main = mainKeyFromEvent(e)
      if (!main || mods.length === 0) return
      void update({ hotkey: [...mods, main].join('+') })
      setCapturing(false)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [capturing, update])

  const saveToken = useCallback(async () => {
    const value = tokenInput.trim()
    if (!value) return
    const ok = await window.yriya.setToken(value)
    setHasToken(ok)
    setMaskedToken(await window.yriya.getMaskedToken())
    setTokenInput('')
    showFlash('Token хадгалагдлаа ✓')
    if (ok) void runTest()
  }, [tokenInput, showFlash, runTest])

  const clearToken = useCallback(async () => {
    await window.yriya.setToken('')
    setHasToken(false)
    setMaskedToken('')
    setConn({ status: 'idle', message: '' })
    showFlash('Token устгагдлаа')
  }, [showFlash])

  const saveOpenaiKey = useCallback(async () => {
    const value = openaiInput.trim()
    if (!value) return
    const ok = await window.yriya.setOpenaiKey(value)
    setOpenaiHasKey(ok)
    setMaskedOpenai(await window.yriya.getMaskedOpenaiKey())
    setOpenaiInput('')
    showFlash('OpenAI key хадгалагдлаа ✓')
    if (ok) void runOpenaiTest()
  }, [openaiInput, showFlash, runOpenaiTest])

  const clearOpenaiKey = useCallback(async () => {
    await window.yriya.setOpenaiKey('')
    setOpenaiHasKey(false)
    setMaskedOpenai('')
    setOpenaiConn({ status: 'idle', message: '' })
    showFlash('OpenAI key устгагдлаа')
  }, [showFlash])

  // Нэмэлт нэр томьёог хадгална (textarea-аас гарахад). Өөрчлөгдсөн үед л хадгална.
  const saveVocab = useCallback(() => {
    const words = [
      ...new Set(
        vocabText
          .split(/[,\n]+/)
          .map((w) => w.trim())
          .filter(Boolean)
      )
    ]
    const current = settings?.customVocabulary ?? []
    if (words.length === current.length && words.every((w, i) => w === current[i])) return
    void update({ customVocabulary: words })
  }, [vocabText, settings, update])

  const toggleMicTest = useCallback(async () => {
    if (testing) {
      testCleanup.current?.()
      testCleanup.current = null
      setTesting(false)
      return
    }
    try {
      const micId = settings?.microphoneId
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true
      })
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      let raf = 0
      const tick = (): void => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        if (meterRef.current) {
          meterRef.current.style.width = `${Math.min(100, rms * 320)}%`
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      testCleanup.current = (): void => {
        cancelAnimationFrame(raf)
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close()
        if (meterRef.current) meterRef.current.style.width = '0%'
      }
      setTesting(true)
    } catch {
      showFlash('Микрофон нээж чадсангүй')
    }
  }, [testing, settings?.microphoneId, showFlash])

  if (!settings) {
    return <div className="loading">Уншиж байна…</div>
  }

  // Сонгосон хөдөлгүүрийн дагуу «бэлэн» эсэхийг тодорхойлно.
  const ready =
    settings.transcriptionMode === 'fast' ? hasToken : hasToken && openaiHasKey

  return (
    <div className="app">
      <header className="hero">
        <div className="logo">
          <span className="logo-bars">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="hero-text">
          <h1>Yriya</h1>
          <p>Монгол хэлний дуу хоолойн бичигч</p>
        </div>
        <span className={`status-chip ${ready ? 'ok' : 'warn'}`}>
          {ready ? 'Бэлэн' : 'Тохиргоо дутуу'}
        </span>
      </header>

      {/* Chimege token */}
      {!hasToken ? (
        <section className="card hero-card">
          <div className="card-head">
            <span className="card-icon">
              <Icon name="key" />
            </span>
            <h2>Эхлүүлэхэд бэлдье</h2>
          </div>
          <ol className="steps">
            <li>
              <b>console.chimege.com</b> дээр нэвтэрч <b>«Монгол STT-Long»</b>{' '}
              төрлийн идэвхтэй token үүсгэнэ
            </li>
            <li>Доорх талбарт хуулж тавиад «Холбох» дарна</li>
          </ol>
          <div className="token-row">
            <input
              type="password"
              placeholder="Монгол STT-Long token"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveToken()
              }}
            />
            <button className="primary" onClick={() => void saveToken()} disabled={!tokenInput.trim()}>
              Холбох
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="card-head">
            <span className="card-icon">
              <Icon name="key" />
            </span>
            <h2>Chimege API</h2>
            <span className="badge ok">Холбогдсон</span>
          </div>
          <p className="hint">
            Token шифрлэгдэн хадгалагдсан: <code>{maskedToken}</code>
          </p>
          <p className="hint">
            Энэ апп-аар ойролцоогоор <b>{formatUsage(usage)}</b> хөрвүүлсэн.
            Үлдэгдэл квот, дуусах хугацааг console.chimege.com дээр шалгана уу.
          </p>
          <div className="token-row">
            <input
              type="password"
              placeholder="Шинэ token-оор солих"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveToken()
              }}
            />
            <button className="primary" onClick={() => void saveToken()} disabled={!tokenInput.trim()}>
              Солих
            </button>
          </div>
          <div className="conn">
            <button
              className="ghost-sm"
              onClick={() => void runTest()}
              disabled={conn.status === 'testing'}
            >
              {conn.status === 'testing' ? 'Шалгаж байна…' : 'Холболт шалгах'}
            </button>
            {(conn.status === 'ok' || conn.status === 'fail') && (
              <span className={`conn-msg ${conn.status}`}>{conn.message}</span>
            )}
          </div>
          <button className="link-danger" onClick={() => void clearToken()}>
            Token устгах
          </button>
        </section>
      )}

      {/* Транскрипцийн горим */}
      <Card icon="sparkle" title="Транскрипцийн горим">
        <Field
          label="Горим"
          hint="Premium/High нь монгол+гадаад үгийг тус тусын үсгээр зөв гаргана"
        >
          <select
            value={settings.transcriptionMode}
            onChange={(e) =>
              void update({ transcriptionMode: e.target.value as TranscriptionMode })
            }
          >
            <option value="fast">Fast — зөвхөн Chimege (хурдан, монгол)</option>
            <option value="premium">Premium Mixed — Chimege + GPT нэгтгэлт</option>
            <option value="high">High Accuracy — Chimege + GPT (нарийвчлалтай)</option>
          </select>
        </Field>

        {settings.transcriptionMode !== 'fast' && (
          <>
            <p className="hint">
              OpenAI API key хэрэгтэй — <b>platform.openai.com</b> дээрээс авна.
            </p>
            {openaiHasKey && (
              <p className="hint">
                Key шифрлэгдэн хадгалагдсан: <code>{maskedOpenai}</code>
              </p>
            )}
            <div className="token-row">
              <input
                type="password"
                placeholder={openaiHasKey ? 'Шинэ key-ээр солих' : 'OpenAI API key (sk-…)'}
                value={openaiInput}
                onChange={(e) => setOpenaiInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveOpenaiKey()
                }}
              />
              <button
                className="primary"
                onClick={() => void saveOpenaiKey()}
                disabled={!openaiInput.trim()}
              >
                {openaiHasKey ? 'Солих' : 'Холбох'}
              </button>
            </div>
            {openaiHasKey && (
              <>
                <div className="conn">
                  <button
                    className="ghost-sm"
                    onClick={() => void runOpenaiTest()}
                    disabled={openaiConn.status === 'testing'}
                  >
                    {openaiConn.status === 'testing' ? 'Шалгаж байна…' : 'Холболт шалгах'}
                  </button>
                  {(openaiConn.status === 'ok' || openaiConn.status === 'fail') && (
                    <span className={`conn-msg ${openaiConn.status}`}>{openaiConn.message}</span>
                  )}
                </div>
                <button className="link-danger" onClick={() => void clearOpenaiKey()}>
                  OpenAI key устгах
                </button>
              </>
            )}

            <Field
              label="Нэмэлт нэр томьёо"
              hint="Англи/программчлал/бренд үгсээ таслалаар тусгаарлаж бичнэ — таних чанарыг сайжруулна"
            >
              <textarea
                className="vocab-input"
                placeholder="жишээ: React, Supabase, Next.js"
                value={vocabText}
                onChange={(e) => setVocabText(e.target.value)}
                onBlur={saveVocab}
                rows={3}
              />
            </Field>
          </>
        )}
      </Card>

      {/* Богино товчлуур */}
      <Card icon="keyboard" title="Богино товчлуур">
        <div className="hotkey-row">
          <div className={`keys ${capturing ? 'capturing' : ''}`}>
            {capturing ? (
              <span className="keys-hint">Товчлуураа дарна уу…</span>
            ) : (
              parseHotkey(settings.hotkey).map((k, i) => <kbd key={i}>{k}</kbd>)
            )}
          </div>
          <button className="ghost-sm" onClick={() => setCapturing((c) => !c)}>
            {capturing ? 'Болих' : 'Өөрчлөх'}
          </button>
        </div>
        <small>
          Yriya-ийн товчийг харуулах/нуух товчлуур. Бичлэгийг товчин дээр
          хулганаар дарж эхлүүлнэ. Modifier (Ctrl/Shift/Alt) + товч.
        </small>
        {!hotkeyOk && (
          <small className="warn-note">
            ⚠ Энэ товчлуурыг бүртгэж чадсангүй — өөр программ ашиглаж байж
            магадгүй. Өөр товчлуур сонгоно уу. (Overlay товчоор удирдах боломжтой.)
          </small>
        )}
      </Card>

      {/* Эхлүүлэлт */}
      <Card icon="power" title="Эхлүүлэлт">
        <Toggle
          label="Компьютер асах үед автоматаар эхлүүлэх"
          hint="Yriya арын талд (tray) үргэлж ажиллаж, hotkey байнга бэлэн байна. Суулгасан аппд хүчинтэй."
          checked={settings.launchAtLogin}
          onChange={(v) => void update({ launchAtLogin: v })}
        />
      </Card>

      {/* Микрофон */}
      <Card icon="mic" title="Микрофон">
        <Field label="Төхөөрөмж">
          <select
            value={settings.microphoneId}
            onChange={(e) => void update({ microphoneId: e.target.value })}
          >
            <option value="">Системийн үндсэн</option>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || `Микрофон (${m.deviceId.slice(0, 6)})`}
              </option>
            ))}
          </select>
        </Field>
        <div className="mic-test">
          <button className={`ghost-sm ${testing ? 'on' : ''}`} onClick={() => void toggleMicTest()}>
            {testing ? 'Зогсоох' : 'Дуу шалгах'}
          </button>
          <div className="meter">
            <div className="meter-fill" ref={meterRef} />
          </div>
        </div>
      </Card>

      {/* Бичвэр боловсруулалт */}
      <Card icon="sparkle" title="Бичвэр боловсруулалт">
        <Toggle
          label="Өгүүлбэрийн эхний үсгийг том болгох"
          checked={settings.autoCapitalize}
          onChange={(v) => void update({ autoCapitalize: v })}
        />
        <Toggle
          label="Сегмент хооронд зай нэмэх"
          checked={settings.trailingSpace}
          onChange={(v) => void update({ trailingSpace: v })}
        />
      </Card>

      {/* Текст оруулалт */}
      <Card icon="caret" title="Текст оруулалт">
        <Toggle
          label="Cursor байрлалд автоматаар оруулах"
          hint="Унтраавал текст зөвхөн clipboard-д хуулагдана"
          checked={settings.autoInject}
          onChange={(v) => void update({ autoInject: v })}
        />
        <Field label="Оруулах арга">
          <select
            value={settings.injectMode}
            disabled={!settings.autoInject}
            onChange={(e) => void update({ injectMode: e.target.value as InjectMode })}
          >
            <option value="paste">Paste (Ctrl+V) — найдвартай</option>
            <option value="type">Тэмдэгтээр шивэх</option>
          </select>
        </Field>
      </Card>

      {/* Яриа таних тохируулга */}
      <Card icon="tune" title="Яриа таних тохируулга">
        <Toggle
          label="Зогсоох хүртэл тасралтгүй бичих"
          hint="Бодож завсарлахад тасрахгүй — текст зөвхөн та зогсоосны дараа гарч ирнэ"
          checked={settings.continuousRecording}
          onChange={(v) => void update({ continuousRecording: v })}
        />
        <Toggle
          label="Микрофоны мэдрэмжийг автоматаар тохируулах"
          hint="Бичлэг эхлэх бүрд орчны шуугааныг хэмжиж босгыг автоматаар тааруулна"
          checked={settings.autoCalibrate}
          onChange={(v) => void update({ autoCalibrate: v })}
        />
        <Slider
          label="Мэдрэмж"
          hint={
            settings.autoCalibrate
              ? 'Автомат горимд идэвхгүй — дээрх тохиргоог унтраавал гараар тааруулна'
              : 'Хамгийн бага босго. Бага утга = илүү мэдрэмтгий'
          }
          min={0.005}
          max={0.08}
          step={0.005}
          value={settings.vadThreshold}
          display={settings.vadThreshold.toFixed(3)}
          disabled={settings.autoCalibrate}
          onChange={(v) => void update({ vadThreshold: v })}
        />
        <Slider
          label="Өгүүлбэр таслах завсар"
          hint="Хэдэн мс чимээгүй байвал өгүүлбэр дууссан гэж үзэх"
          min={300}
          max={1500}
          step={50}
          value={settings.silenceMs}
          display={`${settings.silenceMs} мс`}
          onChange={(v) => void update({ silenceMs: v })}
        />
      </Card>

      <footer>
        <span className="flash">{flash}</span>
        <div className="footer-actions">
          <button className="ghost" onClick={() => window.yriya.openLog()}>
            Лог файл нээх
          </button>
          <button className="ghost" onClick={() => window.yriya.quit()}>
            Программаас гарах
          </button>
        </div>
      </footer>
    </div>
  )
}

/* ---------- Туслах компонентууд ---------- */
function Card({
  icon,
  title,
  children
}: {
  icon: string
  title: string
  children: ReactNode
}): JSX.Element {
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-icon">
          <Icon name={icon} />
        </span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <small>{hint}</small> : null}
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <div className="toggle" onClick={() => onChange(!checked)}>
      <div className="toggle-text">
        <label>{label}</label>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className={`switch ${checked ? 'on' : ''}`}>
        <span />
      </div>
    </div>
  )
}

function Slider({
  label,
  hint,
  min,
  max,
  step,
  value,
  display,
  disabled,
  onChange
}: {
  label: string
  hint?: string
  min: number
  max: number
  step: number
  value: number
  display: string
  disabled?: boolean
  onChange: (v: number) => void
}): JSX.Element {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div
      className="field"
      style={disabled ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
    >
      <label>
        {label} <em>{display}</em>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {hint ? <small>{hint}</small> : null}
    </div>
  )
}
