import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from '@/App'
import '@/index.css'
import { registerSW } from 'virtual:pwa-register'

// Service worker только в браузере: в Capacitor (WebView) он мешает нативной
// загрузке ассетов и не нужен — приложение и так офлайн.
if (location.protocol.startsWith('http') && !Capacitor.isNativePlatform()) {
  registerSW({ immediate: true })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
