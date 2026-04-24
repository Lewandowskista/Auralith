const { spawn } = require('node:child_process')
const { dirname, join } = require('node:path')

const args = process.argv.slice(2)

if (args.length === 0) {
  console.error('Usage: node ./scripts/run-electron-vite.cjs <dev|preview> [...args]')
  process.exit(1)
}

const electronVitePackage = require.resolve('electron-vite/package.json')
const electronViteBin = join(dirname(electronVitePackage), 'bin', 'electron-vite.js')
const env = { ...process.env }

// Some agent/CI terminals set this so Electron behaves like plain Node.
// Dev/preview need the real Electron runtime for `app`, `BrowserWindow`, etc.
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [electronViteBin, ...args], {
  env,
  stdio: 'inherit',
  windowsHide: false,
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
