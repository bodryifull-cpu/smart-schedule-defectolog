// Точка входа Electron: открывает собранное приложение (dist/index.html) в окне.
const { app, BrowserWindow, ipcMain, net, session } = require('electron')
const path = require('node:path')

// Хосты GigaChat используют ГОСТ-сертификаты Минцифры — Chromium им не доверяет.
// Доверяем явно только этим хостам, остальные проверяются стандартно.
const GIGA_HOSTS = ['api.giga.chat', 'gigachat.devices.sberbank.ru', 'ngw.devices.sberbank.ru']

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../public/pwa-512x512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  })
  win.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(() => {
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    if (GIGA_HOSTS.includes(request.hostname)) {
      callback(0) // доверяем (ГОСТ-сертификат GigaChat)
      return
    }
    callback(-3) // стандартная проверка Chromium
  })

  // Сетевые запросы к GigaChat из main-процесса: без CORS, с отменой не заморачиваемся —
  // renderer отменяет операцию на своей стороне (graceful stop).
  ipcMain.handle('giga-fetch', async (_event, url, options) => {
    const resp = await net.fetch(url, options)
    return { status: resp.status, body: await resp.text() }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
