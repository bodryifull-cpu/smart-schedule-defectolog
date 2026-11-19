# Умное расписание дефектолога — Android

Android-версия приложения «Умное расписание дефектолога»: веб-приложение
(React + Vite + Dexie/IndexedDB) упаковано в нативное Android-приложение через
[Capacitor 7](https://capacitorjs.com/).

## Что адаптировано под Android

- **Поворот экрана (гироскоп/акселерометр):** `android:screenOrientation="fullUser"`
  в `android/app/src/main/AndroidManifest.xml` — приложение поворачивается вслед
  за устройством (портрет/ландшафт), учитывая системную блокировку поворота.
- **Адаптивная вёрстка:** шапка сворачивается в иконки на телефонах, сетка
  расписания скроллится горизонтально, кнопки удаления/переноса видны на
  сенсорных экранах без наведения, учтены вырезы экрана (safe-area).
- **Экспорт файлов:** DOCX/XLSX сохраняются в папку «Документы» телефона через
  плагин `@capacitor/filesystem` (в WebView скачивание через `<a download>` не работает).
- **GigaChat:** запросы идут через нативный HTTP (`CapacitorHttp`) — без CORS.
  Для ГОСТ-сертификатов Минцифры добавлен `network_security_config.xml`,
  доверяющий пользовательским сертификатам: при необходимости установите
  корневой сертификат с https://subca.gosuslugi.ru на устройстве.
- **Данные:** IndexedDB в WebView — расписание и темы хранятся локально,
  приложение работает офлайн.

## Требования

- Node.js 18+
- JDK 17
- Android SDK (platform android-35, build-tools) — путь прописан в `android/local.properties`

## Сборка APK

```bash
npm install          # один раз
npm run apk          # сборка веб-бандла + sync + gradlew assembleDebug
```

Готовый APK: `android/app/build/outputs/apk/debug/app-debug.apk`

Либо вручную:

```bash
npm run build              # tsc + vite build → dist/
npx cap sync android       # копирование dist в android-assets
cd android && gradlew assembleDebug
```

Release-сборка (подписанная, для RuStore):

```bash
cd android && gradlew assembleRelease
```

Готовый файл: `android/app/build/outputs/apk/release/app-release.apk`

## Подпись для RuStore

Release-подпись уже настроена:

- `android/app/rustore.keystore` — ключ разработчика (RSA 2048, срок действия 30 лет);
- `android/keystore.properties` — пароли и алиас ключа (оба файла в `.gitignore`);
- `android/app/build.gradle` — `signingConfigs.release` читает параметры из `keystore.properties`.

**ВАЖНО:** сделайте резервную копию `rustore.keystore` и `keystore.properties`
(например, на флешку или в облако). При потере ключа обновить приложение
в RuStore будет нельзя — придётся публиковать заново как новое.

Проверка подписи:

```bash
"%LOCALAPPDATA%\Android\Sdk\build-tools\35.0.0\apksigner.bat" verify --print-certs android\app\build\outputs\apk\release\app-release.apk
```

Перед публикацией обновления увеличивайте `versionCode` и `versionName`
в `android/app/build.gradle` (RuStore не примет APK с тем же versionCode).

Загрузка: кабинет разработчика https://www.rustore.ru/console/ →
«Создать приложение» → загрузить APK → заполнить описание, скриншоты,
возрастной рейтинг и ссылку на политику конфиденциальности → на модерацию.

## Установка на устройство

1. Скопируйте `app-debug.apk` на телефон/планшет.
2. Откройте файл и разрешите установку из неизвестных источников.

Либо через adb: `adb install android/app/build/outputs/apk/debug/app-debug.apk`

## Отладка

- `npm run dev` — веб-версия в браузере (как раньше).
- `npx cap open android` — проект в Android Studio (эмулятор, Logcat, запуск).
- `npm test` — unit-тесты логики (vitest).

## Иконки

Launcher-иконки генерируются из `public/pwa-512x512.png` скриптом
`scripts-android/make-launcher-icons.ps1` (PowerShell, Windows).
