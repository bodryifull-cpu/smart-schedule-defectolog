// Preload: пробрасывает в renderer единственный мост — gigaFetch (запросы к GigaChat).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('gigaFetch', (url, options) =>
  ipcRenderer.invoke('giga-fetch', url, options)
)
