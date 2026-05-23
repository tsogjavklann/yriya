import type { YriyaApi } from './index'

declare global {
  interface Window {
    yriya: YriyaApi
  }
}

export {}
