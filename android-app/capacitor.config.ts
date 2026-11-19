import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ru.defectolog.smartschedule',
  appName: 'Умное расписание',
  webDir: 'dist',
  android: {
    // Разрешаем WebView кэшировать IndexedDB/данные между сессиями (по умолчанию и так).
    allowMixedContent: false
  }
}

export default config
