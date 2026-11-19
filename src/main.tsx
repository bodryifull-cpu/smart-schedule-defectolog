import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App'
import '@/index.css'
import { registerSW } from 'virtual:pwa-register'

// В Electron (file://) сервис-воркер недоступен — регистрируем только в браузере.
if (location.protocol.startsWith('http')) {
  registerSW({ immediate: true })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
