// Сборка Windows-установщика. Промежуточные файлы пишутся во временную папку
// (на диске D: антивирус блокирует переименование при распаковке Electron),
// готовый .exe копируется в ./release/.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const outDir = path.join(os.tmpdir(), 'eb-release')

execSync('npm run build', { stdio: 'inherit' })
execSync(`npx electron-builder --win -c.directories.output="${outDir}"`, { stdio: 'inherit' })

const setups = fs.readdirSync(outDir).filter((f) => f.endsWith('.exe') && f.includes('Setup'))
if (setups.length === 0) {
  console.error('Установщик не найден во временной папке')
  process.exit(1)
}
fs.mkdirSync('release', { recursive: true })
for (const f of setups) {
  fs.copyFileSync(path.join(outDir, f), path.join('release', f))
}
fs.rmSync(outDir, { recursive: true, force: true })
console.log('\nГотово. Установщик:')
for (const f of setups) console.log('  release\\' + f)
