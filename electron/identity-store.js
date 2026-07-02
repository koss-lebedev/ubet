'use strict'

// Global identity store — runs in Electron main (Node). Owns the encrypted
// seed and the profile at the app-data root (outside any tournament dir), so
// identity persists across tournaments. Encryption is delegated to an injected
// crypter (real one = Electron safeStorage; a reversible fake in tests).

const { promises: fs } = require('fs')
const path = require('path')
const { createWallet, walletFromSeed, isValidMnemonic } = require('./wallet.js')

async function openIdentityStore({ dir, crypter }) {
  const seedPath = path.join(dir, 'wallet.enc')
  const profilePath = path.join(dir, 'profile.json')
  let wallet = null
  let profile = { address: '', name: '', badges: [] }

  async function persistProfile() {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(profilePath, JSON.stringify(profile), 'utf-8')
  }
  async function persistSeed(seed) {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(seedPath, await crypter.encrypt(seed))
  }
  async function useSeed(seed) {
    wallet = await walletFromSeed(seed)
    profile.address = wallet.address
  }

  return {
    get wallet() {
      return wallet
    },
    getProfile() {
      return profile
    },
    getRecoveryPhrase() {
      return wallet.getRecoveryPhrase()
    },
    async loadOrCreate() {
      let seed
      try {
        seed = await crypter.decrypt(await fs.readFile(seedPath))
      } catch {
        seed = null
      }
      if (seed) {
        await useSeed(seed)
        try {
          profile = { badges: [], ...JSON.parse(await fs.readFile(profilePath, 'utf-8')) }
        } catch {}
        profile.address = wallet.address
      } else {
        const created = await createWallet()
        await persistSeed(created.seed)
        await useSeed(created.seed)
        await persistProfile()
      }
      return { address: profile.address, name: profile.name }
    },
    async setName(name) {
      profile.name = String(name ?? '')
      await persistProfile()
    },
    async restore(phrase) {
      if (!(await isValidMnemonic(phrase))) throw new Error('Invalid recovery phrase')
      await persistSeed(phrase)
      await useSeed(phrase)
      profile.name = profile.name || ''
      await persistProfile()
      return { address: profile.address, name: profile.name }
    }
  }
}

module.exports = { openIdentityStore }
