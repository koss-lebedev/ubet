'use strict'

// Global identity store — runs in Electron main (Node). Holds any number of
// self-custodial wallets and remembers which one is "active". Each wallet's
// BIP-39 seed is encrypted at rest (via the injected crypter = safeStorage);
// a single index.json holds the per-identity profiles and the active address.
//
//   <dir>/index.json          { active, profiles: { <address>: { address, name, badges } } }
//   <dir>/seeds/<address>.enc  encrypted seed, one per identity

const { promises: fs } = require('fs')
const path = require('path')
const { createWallet, walletFromSeed, isValidMnemonic } = require('./wallet.js')

async function openIdentityStore({ dir, crypter }) {
  const indexPath = path.join(dir, 'index.json')
  const seedsDir = path.join(dir, 'seeds')
  let index = { active: null, profiles: {} }
  let wallet = null // the active wallet, if any

  async function persist() {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(indexPath, JSON.stringify(index), 'utf-8')
  }
  async function writeSeed(address, seed) {
    await fs.mkdir(seedsDir, { recursive: true })
    await fs.writeFile(path.join(seedsDir, address + '.enc'), await crypter.encrypt(seed))
  }
  async function readSeed(address) {
    return crypter.decrypt(await fs.readFile(path.join(seedsDir, address + '.enc')))
  }
  async function activate(address) {
    wallet = await walletFromSeed(await readSeed(address))
    index.active = address
  }

  const store = {
    get wallet() {
      return wallet
    },
    list() {
      return {
        active: index.active,
        identities: Object.values(index.profiles).map((p) => ({ address: p.address, name: p.name }))
      }
    },
    active() {
      if (!index.active) return null
      const p = index.profiles[index.active]
      return { address: p.address, name: p.name }
    },
    // Kept for the worker's wallet-identity RPC: active identity, or an empty
    // placeholder when nothing has been chosen yet.
    getProfile() {
      return store.active() || { address: '', name: '' }
    },
    getRecoveryPhrase() {
      if (!wallet) throw new Error('No active identity')
      return wallet.getRecoveryPhrase()
    },
    async load() {
      try {
        index = { active: null, profiles: {}, ...JSON.parse(await fs.readFile(indexPath, 'utf-8')) }
      } catch {
        index = { active: null, profiles: {} }
      }
      if (index.active && index.profiles[index.active]) {
        await activate(index.active)
      } else {
        index.active = null
        wallet = null
      }
      return store.list()
    },
    async create() {
      const { seed, address } = await createWallet()
      await writeSeed(address, seed)
      index.profiles[address] = { address, name: '', badges: [] }
      wallet = await walletFromSeed(seed)
      index.active = address
      await persist()
      return store.active()
    },
    async select(address) {
      if (!index.profiles[address]) throw new Error('Unknown identity')
      await activate(address)
      await persist()
      return store.active()
    },
    async setName(name) {
      if (!index.active) throw new Error('No active identity')
      index.profiles[index.active].name = String(name ?? '')
      await persist()
      return store.active()
    },
    async restore(phrase) {
      if (!(await isValidMnemonic(phrase))) throw new Error('Invalid recovery phrase')
      const w = await walletFromSeed(phrase)
      await writeSeed(w.address, phrase)
      if (!index.profiles[w.address]) {
        index.profiles[w.address] = { address: w.address, name: '', badges: [] }
      }
      wallet = w
      index.active = w.address
      await persist()
      return store.active()
    }
  }

  return store
}

module.exports = { openIdentityStore }
