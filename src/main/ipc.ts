import { ipcMain, screen, shell, Menu, type BrowserWindow } from 'electron'
import {
  getSettings,
  saveSettings,
  getToken,
  setToken,
  hasToken,
  getUsageSeconds,
  getOpenaiKey,
  setOpenaiKey,
  hasOpenaiKey
} from './store'
import { testKey } from './transcription/openaiTranscribe'
import { testToken } from './transcription/chimege'
import { logPath } from './logger'
import {
  toggleSession,
  startSession,
  stopSession,
  cancelSession,
  isActive,
  enqueueSegment,
  onSpeechActivity,
  reportAudioError
} from './session'
import type { Settings } from '../shared/types'

export interface IpcDeps {
  openSettings: () => void
  applyHotkey: () => void
  applyLoginItem: () => void
  quitApp: () => void
  getOverlay: () => BrowserWindow | null
  getHotkeyOk: () => boolean
}

export function registerIpc(deps: IpcDeps): void {
  // --- тохиргоо ---
  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const prev = getSettings()
    const next = saveSettings(patch ?? {})
    if (patch && patch.hotkey !== undefined && patch.hotkey !== prev.hotkey) {
      deps.applyHotkey()
    }
    if (patch && patch.launchAtLogin !== undefined && patch.launchAtLogin !== prev.launchAtLogin) {
      deps.applyLoginItem()
    }
    return next
  })

  ipcMain.handle('hotkey:status', () => deps.getHotkeyOk())

  ipcMain.handle('token:status', () => hasToken())
  ipcMain.handle('token:get-masked', () => maskToken(getToken()))
  ipcMain.handle('token:set', (_e, token: unknown) => {
    // trailing whitespace болон санамсаргүй хашилтыг арилгана
    const clean =
      typeof token === 'string'
        ? token.trim().replace(/^["'`]+|["'`]+$/g, '').trim()
        : ''
    setToken(clean)
    return hasToken()
  })
  ipcMain.handle('token:test', () => testToken())
  ipcMain.handle('usage:get', () => getUsageSeconds())

  // --- OpenAI (Whisper) API key ---
  ipcMain.handle('openai:status', () => hasOpenaiKey())
  ipcMain.handle('openai:get-masked', () => maskToken(getOpenaiKey()))
  ipcMain.handle('openai:set', (_e, key: unknown) => {
    const clean =
      typeof key === 'string' ? key.trim().replace(/^["'`]+|["'`]+$/g, '').trim() : ''
    setOpenaiKey(clean)
    return hasOpenaiKey()
  })
  ipcMain.handle('openai:test', () => testKey())
  ipcMain.on('log:open', () => {
    void shell.openPath(logPath())
  })

  // --- session ---
  ipcMain.on('session:toggle', () => toggleSession())
  ipcMain.on('session:start', () => startSession())
  ipcMain.on('session:stop', () => stopSession())
  ipcMain.on('session:cancel', () => cancelSession())

  // --- overlay товчны удирдлага ---
  // Дамжуулах горим: товч дээр хулгана байх үед л дарагдана, бусад үед
  // доорх цонх руу click-ийг нэвтрүүлнэ.
  ipcMain.on('overlay:set-interactive', (_e, interactive: unknown) => {
    const w = deps.getOverlay()
    if (!w || w.isDestroyed()) return
    if (interactive) {
      w.setIgnoreMouseEvents(false)
    } else {
      w.setIgnoreMouseEvents(true, { forward: true })
    }
  })

  ipcMain.on('overlay:drag-by', (_e, payload: unknown) => {
    const w = deps.getOverlay()
    if (!w || w.isDestroyed()) return
    const { dx, dy } = (payload ?? {}) as { dx?: number; dy?: number }
    if (typeof dx !== 'number' || typeof dy !== 'number') return
    const b = w.getBounds()
    const area = screen.getDisplayMatching(b).workArea
    const x = Math.min(area.x + area.width - b.width, Math.max(area.x, b.x + dx))
    const y = Math.min(area.y + area.height - b.height, Math.max(area.y, b.y + dy))
    w.setPosition(Math.round(x), Math.round(y))
  })

  ipcMain.on('overlay:drag-end', () => {
    const w = deps.getOverlay()
    if (!w || w.isDestroyed()) return
    const [x, y] = w.getPosition()
    saveSettings({ overlayX: x, overlayY: y })
  })

  // Товч дээр баруун товшиход гарах цэс
  ipcMain.on('overlay:context-menu', () => {
    const w = deps.getOverlay()
    const menu = Menu.buildFromTemplate([
      ...(isActive()
        ? [
            {
              label: 'Бичлэг цуцлах (Esc) — текст оруулахгүй',
              click: () => cancelSession()
            },
            { type: 'separator' as const }
          ]
        : []),
      { label: 'Тохиргоо…', click: () => deps.openSettings() },
      {
        label: 'Товчийг нуух',
        click: () => {
          if (w && !w.isDestroyed()) {
            if (isActive()) stopSession()
            w.hide()
          }
        }
      },
      { type: 'separator' },
      { label: 'Программаас гарах', click: () => deps.quitApp() }
    ])
    if (w && !w.isDestroyed()) menu.popup({ window: w })
    else menu.popup()
  })

  // --- overlay renderer → main ---
  ipcMain.on('audio:segment', (_e, wav: ArrayBuffer) => {
    if (wav && wav.byteLength > 0) enqueueSegment(wav)
  })
  ipcMain.on('audio:activity', (_e, speaking: unknown) => onSpeechActivity(!!speaking))
  ipcMain.on('audio:error', (_e, message: unknown) =>
    reportAudioError(String(message || 'Микрофоны алдаа'))
  )

  // --- бусад ---
  ipcMain.on('window:open-settings', () => deps.openSettings())
  ipcMain.on('app:quit', () => deps.quitApp())
}

function maskToken(token: string): string {
  if (!token) return ''
  if (token.length <= 6) return '••••••'
  return `${token.slice(0, 3)}••••••${token.slice(-3)}`
}
