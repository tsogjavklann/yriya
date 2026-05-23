import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { OverlayStatus, Settings, TokenTestResult } from '../shared/types'

type Unsubscribe = () => void

function listen<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  // --- тохиргоо ---
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:set', patch),
  getTokenStatus: (): Promise<boolean> => ipcRenderer.invoke('token:status'),
  getHotkeyStatus: (): Promise<boolean> => ipcRenderer.invoke('hotkey:status'),
  getMaskedToken: (): Promise<string> => ipcRenderer.invoke('token:get-masked'),
  setToken: (token: string): Promise<boolean> => ipcRenderer.invoke('token:set', token),
  testToken: (): Promise<TokenTestResult> => ipcRenderer.invoke('token:test'),
  getUsageSeconds: (): Promise<number> => ipcRenderer.invoke('usage:get'),

  // --- OpenAI (Whisper) API key ---
  getOpenaiStatus: (): Promise<boolean> => ipcRenderer.invoke('openai:status'),
  getMaskedOpenaiKey: (): Promise<string> => ipcRenderer.invoke('openai:get-masked'),
  setOpenaiKey: (key: string): Promise<boolean> => ipcRenderer.invoke('openai:set', key),
  testOpenaiKey: (): Promise<TokenTestResult> => ipcRenderer.invoke('openai:test'),

  // --- session удирдлага ---
  toggleSession: (): void => ipcRenderer.send('session:toggle'),
  stopSession: (): void => ipcRenderer.send('session:stop'),
  cancelSession: (): void => ipcRenderer.send('session:cancel'),

  // --- overlay товчны удирдлага ---
  setOverlayInteractive: (interactive: boolean): void =>
    ipcRenderer.send('overlay:set-interactive', interactive),
  dragOverlayBy: (dx: number, dy: number): void =>
    ipcRenderer.send('overlay:drag-by', { dx, dy }),
  endOverlayDrag: (): void => ipcRenderer.send('overlay:drag-end'),
  showOverlayMenu: (): void => ipcRenderer.send('overlay:context-menu'),

  // --- overlay renderer → main (аудио) ---
  sendSegment: (wav: ArrayBuffer): void => ipcRenderer.send('audio:segment', wav),
  sendActivity: (speaking: boolean): void => ipcRenderer.send('audio:activity', speaking),
  sendAudioError: (message: string): void => ipcRenderer.send('audio:error', message),

  // --- main → overlay renderer ---
  onAudioStart: (cb: (settings: Settings) => void): Unsubscribe => listen('audio:start', cb),
  onAudioStop: (cb: () => void): Unsubscribe => listen('audio:stop', cb),
  onAudioCancel: (cb: () => void): Unsubscribe => listen('audio:cancel', cb),
  onStatus: (cb: (status: OverlayStatus) => void): Unsubscribe => listen('overlay:status', cb),

  // --- бусад ---
  openSettings: (): void => ipcRenderer.send('window:open-settings'),
  openLog: (): void => ipcRenderer.send('log:open'),
  quit: (): void => ipcRenderer.send('app:quit')
}

contextBridge.exposeInMainWorld('yriya', api)

export type YriyaApi = typeof api
