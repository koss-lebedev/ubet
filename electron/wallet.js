'use strict'

// WDK wrapper — runs in Electron main (Node). This is the ONLY module that
// touches WDK; everything else consumes the interface below. WDK is ESM-only,
// so it is loaded lazily via dynamic import() (works in Node and Electron).

const DOMAIN = { name: 'ubet', version: '1' }
const TYPES = {
  Identity: [
    { name: 'writerKey', type: 'string' },
    { name: 'address', type: 'address' },
    { name: 'name', type: 'string' }
  ]
}

let _wdk = null
async function loadWdk() {
  if (!_wdk) {
    const WDK = (await import('@tetherto/wdk')).default
    const evm = await import('@tetherto/wdk-wallet-evm')
    _wdk = {
      WDK,
      WalletAccountEvm: evm.WalletAccountEvm,
      WalletAccountReadOnlyEvm: evm.WalletAccountReadOnlyEvm
    }
  }
  return _wdk
}

function typedDataFor({ writerKey, address, name }) {
  return {
    domain: DOMAIN,
    types: TYPES,
    primaryType: 'Identity',
    message: { writerKey, address, name: name || '' }
  }
}

async function walletFromSeed(seed) {
  const { WalletAccountEvm } = await loadWdk()
  const account = new WalletAccountEvm(seed, "0'/0/0", {})
  const address = await account.getAddress()
  return {
    address,
    async signIdentity({ writerKey, name }) {
      const typedData = typedDataFor({ writerKey, address, name })
      const sig = await account.signTypedData(typedData)
      return { typedData, sig }
    },
    getRecoveryPhrase() {
      return seed
    }
  }
}

async function createWallet() {
  const { WDK } = await loadWdk()
  const seed = WDK.getRandomSeedPhrase(24)
  const w = await walletFromSeed(seed)
  return { seed, address: w.address }
}

async function verifyIdentity({ writerKey, address, name }, sig) {
  try {
    const { WalletAccountReadOnlyEvm } = await loadWdk()
    const readOnly = new WalletAccountReadOnlyEvm(address, {})
    return await readOnly.verifyTypedData(typedDataFor({ writerKey, address, name }), sig)
  } catch {
    return false
  }
}

async function isValidMnemonic(phrase) {
  try {
    const { WDK } = await loadWdk()
    return WDK.isValidSeed(phrase)
  } catch {
    return false
  }
}

module.exports = { createWallet, walletFromSeed, verifyIdentity, isValidMnemonic }
