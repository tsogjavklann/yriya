import { app } from 'electron'

/** Хөгжүүлэлтийн горим эсэх (packaged биш). Лог гаргахад ашиглана. */
export function isDev(): boolean {
  return !app.isPackaged
}
