import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'

/**
 * Энгийн JSON тохиргооны хадгалалт + Chimege token-ийг OS-ийн credential
 * store-оор шифрлэн хадгална (safeStorage). Гуравдагч dependency ашиглахгүй.
 */

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function tokenPath(): string {
  return join(app.getPath('userData'), 'token.bin')
}

function openaiKeyPath(): string {
  return join(app.getPath('userData'), 'openai.bin')
}

let cache: Settings | null = null

export function getSettings(): Settings {
  if (cache) return cache
  try {
    const p = settingsPath()
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf-8')) as Partial<Settings>
      cache = { ...DEFAULT_SETTINGS, ...raw }
    } else {
      cache = { ...DEFAULT_SETTINGS }
    }
  } catch (e) {
    console.error('[store] settings уншихад алдаа:', e)
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next: Settings = { ...getSettings(), ...patch }
  cache = next
  try {
    writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8')
  } catch (e) {
    console.error('[store] settings хадгалахад алдаа:', e)
  }
  return next
}

/** Нууц утгыг (token, API key) safeStorage-аар шифрлэн файлд хадгална. */
function writeSecret(path: string, value: string): void {
  try {
    if (!value) {
      writeFileSync(path, Buffer.alloc(0))
      return
    }
    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(value)
      : Buffer.from(value, 'utf-8')
    writeFileSync(path, data)
  } catch (e) {
    console.error('[store] secret хадгалахад алдаа:', e)
  }
}

/** Шифрлэгдсэн нууц утгыг уншиж тайлна. Тайлж чадахгүй бол хоосон буцаана. */
function readSecret(path: string): string {
  try {
    if (!existsSync(path)) return ''
    const data = readFileSync(path)
    if (data.length === 0) return ''
    // safeStorage-аар шифрлэгдсэн blob нь "v10"/"v11" угтвартай байдаг.
    const encrypted = data.length > 3 && /^v1[01]$/.test(data.subarray(0, 3).toString('latin1'))
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(data)
      } catch (e) {
        // Шифрлэгдсэн blob-ыг тайлж чадсангүй — гэмтсэн bytes-ийг буцаавал
        // буруу хүсэлт үүснэ. Хоосон буцааж дахин оруулахыг шаардана.
        if (encrypted) {
          console.error('[store] secret тайлж чадсангүй:', e)
          return ''
        }
        // Шифрлэгдээгүй хуучин формат — шууд унших
        return data.toString('utf-8')
      }
    }
    return encrypted ? '' : data.toString('utf-8')
  } catch (e) {
    console.error('[store] secret уншихад алдаа:', e)
    return ''
  }
}

export function setToken(token: string): void {
  writeSecret(tokenPath(), token)
}

export function getToken(): string {
  return readSecret(tokenPath())
}

export function hasToken(): boolean {
  return getToken().length > 0
}

export function setOpenaiKey(key: string): void {
  writeSecret(openaiKeyPath(), key)
}

export function getOpenaiKey(): string {
  return readSecret(openaiKeyPath())
}

export function hasOpenaiKey(): boolean {
  return getOpenaiKey().length > 0
}

/**
 * Хэрэглээний ойролцоо хэмжээ (секунд). Chimege /stt-long хариу бүрд ирэх
 * `duration`-г нэгтгэн хадгална — серверийн албан ёсны тоо биш, орон нутгийн
 * тооцоо. console.chimege.com дээрх квоттай харьцуулах лавлагаа болно.
 */
function usagePath(): string {
  return join(app.getPath('userData'), 'usage.json')
}

export function getUsageSeconds(): number {
  try {
    const p = usagePath()
    if (!existsSync(p)) return 0
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as { seconds?: number }
    return typeof raw.seconds === 'number' && raw.seconds >= 0 ? raw.seconds : 0
  } catch {
    return 0
  }
}

export function addUsageSeconds(n: number): void {
  if (!Number.isFinite(n) || n <= 0) return
  try {
    const total = Math.round(getUsageSeconds() + n)
    writeFileSync(usagePath(), JSON.stringify({ seconds: total }), 'utf-8')
  } catch (e) {
    console.error('[store] usage хадгалахад алдаа:', e)
  }
}
