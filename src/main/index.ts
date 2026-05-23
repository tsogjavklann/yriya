import { app, BrowserWindow, Menu, Tray, nativeImage, screen, session } from 'electron'
import { join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import { getSettings, hasToken, hasOpenaiKey } from './store'
import { testToken } from './transcription/chimege'
import { testKey } from './transcription/openaiTranscribe'
import { registerHotkey, unregisterHotkey } from './hotkey'
import { initSession, toggleSession, stopSession, cancelSession, isActive } from './session'
import { registerIpc } from './ipc'
import { installLogger } from './logger'

// AudioContext-ийг хэрэглэгчийн үйлдэлгүйгээр resume хийх боломжтой болгоно.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const isDev = !app.isPackaged

let overlayWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let hotkeyOk = true

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

function loadRenderer(win: BrowserWindow, htmlPath: string): void {
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${htmlPath}`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${htmlPath}`))
  }
}

function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 240,
    height: 92,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Эхэндээ click-ийг доош дамжуулна; хулгана товч дээр ирэхэд renderer
  // нь overlay:set-interactive-аар идэвхжүүлнэ (forward: move event-ийг авна).
  win.setIgnoreMouseEvents(true, { forward: true })
  positionOverlay(win)
  loadRenderer(win, 'overlay/index.html')
  // Эхэндээ нуугдмал — hotkey дарах эсвэл бичлэг эхлэхэд харагдана.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win.hide()
    }
  })
  return win
}

function positionOverlay(win: BrowserWindow): void {
  const [w, h] = win.getSize()
  const s = getSettings()
  let x: number
  let y: number
  if (s.overlayX >= 0 && s.overlayY >= 0) {
    x = s.overlayX
    y = s.overlayY
  } else {
    const { workArea } = screen.getPrimaryDisplay()
    x = workArea.x + (workArea.width - w) / 2
    y = workArea.y + workArea.height - h - 10
  }
  // Дэлгэцийн гадна гарахаас сэргийлж харагдах талбарт хязгаарлана.
  const area = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea
  x = Math.min(area.x + area.width - w, Math.max(area.x, x))
  y = Math.min(area.y + area.height - h, Math.max(area.y, y))
  win.setPosition(Math.round(x), Math.round(y))
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 720,
    show: false,
    resizable: false,
    title: 'Yriya — Тохиргоо',
    icon,
    autoHideMenuBar: true,
    backgroundColor: '#0e0f17',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  settingsWindow.on('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
  loadRenderer(settingsWindow, 'settings/index.html')
}

/**
 * Hotkey-ийн үйлдэл: Yriya-ийн товчийг харуулах / нуух.
 * Бичлэгийг товчин дээр хулганаар дарж эхлүүлдэг тул hotkey нь зөвхөн
 * товчийг гаргаж/нууна. Нуухаас өмнө идэвхтэй бичлэгийг зогсооно — нуусан
 * хойно хяналтгүй бичлэг үлдэж API дэмий зарцуулахаас сэргийлнэ.
 */
function toggleOverlay(): void {
  const w = overlayWindow
  if (!w || w.isDestroyed()) return
  if (w.isVisible()) {
    if (isActive()) stopSession()
    w.hide()
  } else {
    w.showInactive()
  }
}

function applyHotkey(): void {
  const { hotkey } = getSettings()
  hotkeyOk = registerHotkey(hotkey, () => toggleOverlay())
  if (!hotkeyOk) console.warn(`[main] hotkey бүртгэж чадсангүй: ${hotkey}`)
}

/**
 * Компьютер асах үед Yriya-г автоматаар эхлүүлэхээр OS-д бүртгэнэ.
 * Зөвхөн суулгасан (packaged) аппд утгатай — dev горимд electron.exe-г
 * бүртгэх нь буруу тул алгасна.
 */
function applyLoginItem(): void {
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({ openAtLogin: getSettings().launchAtLogin })
  } catch (e) {
    console.warn('[main] автомат эхлүүлэлт тохируулж чадсангүй:', e)
  }
}

function trayImage(): Electron.NativeImage {
  const img: Electron.NativeImage = nativeImage.createFromPath(icon)
  if (img.isEmpty()) return img
  return img.resize({ width: 18, height: 18 })
}

function createTray(): void {
  tray = new Tray(trayImage())
  tray.setToolTip('Yriya — Монгол dictation')
  rebuildTrayMenu()
  tray.on('click', () => toggleSession())
}

function rebuildTrayMenu(): void {
  if (!tray || tray.isDestroyed()) return
  const menu = Menu.buildFromTemplate([
    {
      label: isActive() ? 'Бичлэг зогсоох' : 'Бичлэг эхлүүлэх',
      click: () => toggleSession()
    },
    ...(isActive()
      ? [
          {
            label: 'Бичлэг цуцлах (текст оруулахгүй)',
            click: () => cancelSession()
          }
        ]
      : []),
    { type: 'separator' },
    { label: 'Товч харуулах', click: () => overlayWindow?.showInactive() },
    { label: 'Тохиргоо…', click: () => createSettingsWindow() },
    { type: 'separator' },
    {
      label: 'Гарах',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
}

app.whenReady().then(() => {
  installLogger()
  app.setAppUserModelId('mn.yriya.app')

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media')

  overlayWindow = createOverlayWindow()
  initSession(overlayWindow, { onStateChange: rebuildTrayMenu })
  registerIpc({
    openSettings: createSettingsWindow,
    applyHotkey,
    applyLoginItem,
    quitApp: () => {
      quitting = true
      app.quit()
    },
    getOverlay: () => overlayWindow,
    getHotkeyOk: () => hotkeyOk
  })
  createTray()
  applyHotkey()
  applyLoginItem()

  // Сонгосон горимын нэвтрэлт дутуу/хүчингүй бол тохиргооны цонх нээнэ.
  // fast → зөвхөн Chimege token; premium/high → Chimege token + OpenAI key.
  const mode = getSettings().transcriptionMode
  const hasCreds = mode === 'fast' ? hasToken() : hasToken() && hasOpenaiKey()
  if (!hasCreds) {
    setTimeout(() => createSettingsWindow(), 500)
  } else {
    setTimeout(() => {
      const check = mode === 'fast' ? testToken() : testKey()
      void check.then((r) => {
        if (!r.ok) createSettingsWindow()
      })
    }, 900)
  }
})

app.on('second-instance', () => createSettingsWindow())

// Tray апп — бүх цонх хаагдсан ч ажилласаар байна.
app.on('window-all-closed', () => {
  /* no-op */
})

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  unregisterHotkey()
})
