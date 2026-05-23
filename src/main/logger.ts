import { app } from 'electron'
import { join } from 'node:path'
import { appendFileSync, existsSync, statSync, renameSync, rmSync } from 'node:fs'

/**
 * Энгийн файл-логгер. console.log/warn/error-ийг userData доторх yriya.log
 * файлд хуулбарлан бичнэ — алдаа оношлоход тус болно. Файл томрох үед нэг
 * удаа эргүүлж (.old) хадгална.
 */

const MAX_BYTES = 512 * 1024 // 512 KB
let logFile = ''

export function logPath(): string {
  if (!logFile) logFile = join(app.getPath('userData'), 'yriya.log')
  return logFile
}

function fmt(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Error) return a.stack || a.message
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

function write(level: string, args: unknown[]): void {
  try {
    const p = logPath()
    if (existsSync(p) && statSync(p).size > MAX_BYTES) {
      rmSync(p + '.old', { force: true })
      renameSync(p, p + '.old')
    }
    appendFileSync(p, `${new Date().toISOString()} [${level}] ${args.map(fmt).join(' ')}\n`)
  } catch {
    /* лог бичих алдаа аппыг зогсоохгүй */
  }
}

/** console.log/warn/error-ийг файлд бас бичдэг болгож, гэнэтийн алдааг барина. */
export function installLogger(): void {
  const orig = { log: console.log, warn: console.warn, error: console.error }
  console.log = (...a: unknown[]): void => {
    orig.log(...a)
    write('INFO', a)
  }
  console.warn = (...a: unknown[]): void => {
    orig.warn(...a)
    write('WARN', a)
  }
  console.error = (...a: unknown[]): void => {
    orig.error(...a)
    write('ERROR', a)
  }
  process.on('uncaughtException', (e) => write('FATAL', ['uncaughtException', e]))
  process.on('unhandledRejection', (e) => write('FATAL', ['unhandledRejection', e]))
  write('INFO', [`=== Yriya v${app.getVersion()} эхэллээ ===`])
}
