'use strict'

const { isBare } = require('which-runtime')
const { promises: fs } = isBare ? require('bare-fs') : require('fs')
const path = isBare ? require('bare-path') : require('path')

async function writeManifest(storeDir, { key, name }) {
  const manifestPath = path.join(storeDir, 'tournament.json')
  try {
    await fs.readFile(manifestPath)
    return // already exists — leave it untouched
  } catch {}
  await fs.writeFile(manifestPath, JSON.stringify({ key, name, createdAt: Date.now() }), 'utf-8')
}

async function listManifests(tournamentsDir) {
  let entries
  try {
    entries = await fs.readdir(tournamentsDir)
  } catch {
    return []
  }
  const tournaments = []
  for (const entry of entries) {
    const manifestPath = path.join(tournamentsDir, entry, 'tournament.json')
    try {
      const data = JSON.parse(await fs.readFile(manifestPath, 'utf-8'))
      if (data.key && data.name && typeof data.createdAt === 'number') {
        tournaments.push({
          storeDir: path.join(tournamentsDir, entry),
          key: data.key,
          name: data.name,
          createdAt: data.createdAt
        })
      }
    } catch {}
  }
  return tournaments.sort((a, b) => b.createdAt - a.createdAt)
}

module.exports = { writeManifest, listManifests }
