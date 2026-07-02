/* global MAIN_WINDOW_VITE_DEV_SERVER_URL, MAIN_WINDOW_VITE_NAME */
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron')
const os = require('os')
const path = require('path')
const PearRuntime = require('pear-runtime')
const FramedStream = require('framed-stream')
const { openIdentityStore } = require('./identity-store.js')
const { verifyIdentity } = require('./wallet.js')

const { isMac, isLinux, isWindows } = require('which-runtime')
const { command, flag } = require('paparam')
const pkg = require(path.join(app.getAppPath(), 'package.json'))
const { name, productName, version, upgrade } = pkg

const protocol = name
const mainWorkerSpecifier = '/workers/main.js'

const workers = new Map()

const appName = productName ?? name

const cmd = command(
  appName,
  flag('--storage <dir>', 'pass custom storage to pear-runtime'),
  flag('--no-updates', 'start without OTA updates'),
  flag('--no-sandbox', 'start without Chromium sandbox').hide()
)

cmd.parse(app.isPackaged ? process.argv.slice(1) : process.argv.slice(2))

const pearStore = cmd.flags.storage
const updates = cmd.flags.updates

if (pearStore) app.setPath('userData', pearStore)

ipcMain.on('pkg', (evt) => {
  evt.returnValue = pkg
})

function getAppPath() {
  if (!app.isPackaged) return null
  if (isLinux && process.env.APPIMAGE) return process.env.APPIMAGE
  if (isWindows) return process.execPath
  return path.join(process.resourcesPath, '..', '..')
}

function sendToAll(name, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(name, data)
  }
}

// The app-data root shared by the worker (as argv[2]) and the identity store.
function appDataDir() {
  const appPath = getAppPath()
  if (pearStore) return pearStore
  if (appPath === null) return path.join(os.tmpdir(), 'pear', appName)
  const isSnap = !!process.env.SNAP_USER_COMMON
  const linuxConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return isMac
    ? path.join(os.homedir(), 'Library', 'Application Support', appName)
    : isLinux
      ? isSnap
        ? path.join(process.env.SNAP_USER_COMMON, appName)
        : path.join(linuxConfigHome, appName)
      : path.join(os.homedir(), 'AppData', 'Roaming', appName)
}

// Global identity store (wallet seed + profile), created once and encrypted at
// rest via the OS keychain. WDK and safeStorage both live here in main.
const crypter = {
  async encrypt(str) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('OS secure storage is unavailable')
    return safeStorage.encryptString(str)
  },
  async decrypt(buf) {
    return safeStorage.decryptString(Buffer.from(buf))
  }
}
let identityStorePromise = null
function getIdentityStore() {
  if (!identityStorePromise) {
    identityStorePromise = (async () => {
      const store = await openIdentityStore({ dir: path.join(appDataDir(), 'identity'), crypter })
      await store.loadOrCreate()
      return store
    })()
  }
  return identityStorePromise
}

// Answer a wallet RPC request from the worker over its pipe.
async function handleWalletRpc(pipe, msg) {
  try {
    const store = await getIdentityStore()
    let result
    if (msg.cmd === 'wallet-identity') {
      const p = store.getProfile()
      result = { address: p.address, name: p.name }
    } else if (msg.cmd === 'wallet-sign') {
      const { sig } = await store.wallet.signIdentity({
        writerKey: msg.payload.writerKey,
        name: msg.payload.name
      })
      result = { sig }
    } else if (msg.cmd === 'wallet-verify') {
      result = await verifyIdentity(msg.payload, msg.sig)
    } else {
      return
    }
    pipe.write(JSON.stringify({ evt: 'wallet-result', id: msg.id, ok: true, result }))
  } catch (err) {
    pipe.write(JSON.stringify({ evt: 'wallet-result', id: msg.id, ok: false, error: err.message }))
  }
}

// Renderer identity operations (setup, rename, restore, recovery export).
ipcMain.handle('identity:get', async () => {
  const store = await getIdentityStore()
  const p = store.getProfile()
  return { address: p.address, name: p.name }
})
ipcMain.handle('identity:setName', async (_evt, name) => {
  const store = await getIdentityStore()
  await store.setName(name)
  const p = store.getProfile()
  return { address: p.address, name: p.name }
})
ipcMain.handle('identity:restore', async (_evt, phrase) => {
  const store = await getIdentityStore()
  const r = await store.restore(phrase)
  return { address: r.address, name: r.name }
})
ipcMain.handle('identity:exportRecovery', async () => {
  const store = await getIdentityStore()
  return store.getRecoveryPhrase()
})

function getWorker(specifier) {
  if (workers.has(specifier)) return workers.get(specifier)
  if (pearStore) console.log('pear store: ' + pearStore)
  const dir = appDataDir()
  const appPath = getAppPath()

  const extension = isLinux ? '.AppImage' : isMac ? '.app' : '.msix'

  const worker = PearRuntime.run(path.join(app.getAppPath(), specifier), [
    dir,
    appPath,
    updates,
    version,
    upgrade,
    productName + extension
  ])
  const pipe = new FramedStream(worker)

  function sendWorkerStdout(data) {
    sendToAll('pear:worker:stdout:' + specifier, data)
  }
  function sendWorkerStderr(data) {
    sendToAll('pear:worker:stderr:' + specifier, data)
  }
  function sendWorkerIPC(data) {
    sendToAll('pear:worker:ipc:' + specifier, data)
  }
  function onBeforeQuit() {
    pipe.destroy()
  }
  ipcMain.handle('pear:worker:writeIPC:' + specifier, (evt, data) => {
    return pipe.write(data)
  })
  function onWalletRpc(data) {
    let msg = null
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    if (
      !msg ||
      (msg.cmd !== 'wallet-identity' && msg.cmd !== 'wallet-sign' && msg.cmd !== 'wallet-verify')
    ) {
      return
    }
    handleWalletRpc(pipe, msg)
  }
  workers.set(specifier, pipe)
  pipe.on('data', sendWorkerIPC)
  pipe.on('data', onWalletRpc)
  worker.stdout.on('data', sendWorkerStdout)
  worker.stderr.on('data', sendWorkerStderr)
  worker.once('exit', (code) => {
    app.removeListener('before-quit', onBeforeQuit)
    ipcMain.removeHandler('pear:worker:writeIPC:' + specifier)
    pipe.removeListener('data', sendWorkerIPC)
    pipe.removeListener('data', onWalletRpc)
    worker.stdout.removeListener('data', sendWorkerStdout)
    worker.stderr.removeListener('data', sendWorkerStderr)
    sendToAll('pear:worker:exit:' + specifier, code)
    workers.delete(specifier)
  })
  app.on('before-quit', onBeforeQuit)
  return pipe
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
    return
  }

  await win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
}

ipcMain.handle('pear:applyUpdate', () => {
  const pipe = getWorker(mainWorkerSpecifier)

  return new Promise((resolve, reject) => {
    function onData(data) {
      const message = data.toString()

      if (message === 'pear:updateApplied') {
        pipe.removeListener('data', onData)
        resolve()
      }
    }

    pipe.on('data', onData)
    pipe.write('pear:applyUpdate')
  })
})
ipcMain.handle('pear:startWorker', (evt, filename) => {
  getWorker(filename)
  return true
})
ipcMain.handle('app:afterUpdate', () => {
  if (isLinux && process.env.APPIMAGE) {
    app.relaunch({
      execPath: process.env.APPIMAGE,
      args: [
        '--appimage-extract-and-run',
        ...process.argv.slice(1).filter((arg) => arg !== '--appimage-extract-and-run')
      ]
    })
  } else if (!isWindows) {
    app.relaunch()
  }
  app.quit()
})

function handleDeepLink(url) {
  console.log('deep link:', url)
}

app.setAsDefaultProtocolClient(protocol)

app.on('open-url', (evt, url) => {
  evt.preventDefault()
  handleDeepLink(url)
})

const lock = app.requestSingleInstanceLock()

if (!lock) {
  app.quit()
} else {
  app.on('second-instance', (evt, args) => {
    const url = args.find((arg) => arg.startsWith(protocol + '://'))
    if (url) handleDeepLink(url)
  })

  app.whenReady().then(() => {
    createWindow().catch((err) => {
      console.error('Failed to create window:', err)
      app.quit()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow().catch((err) => {
          console.error('Failed to create window:', err)
        })
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
