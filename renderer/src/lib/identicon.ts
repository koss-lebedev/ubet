// Deterministic 5x5 symmetric identicon from an address, returned as an inline
// SVG data URI. The same address always renders the same icon, so two people
// sharing a display name are still visually distinct.
export function identicon(address: string, size = 20): string {
  let h = 0
  for (let i = 0; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) >>> 0
  const hue = h % 360
  const fg = `hsl(${hue} 65% 58%)`
  const cells: string[] = []
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      h = (h * 1103515245 + 12345) >>> 0
      if ((h & 1) === 0) continue
      const xs = x === 2 ? [2] : [x, 4 - x]
      for (const cx of xs) cells.push(`<rect x="${cx}" y="${y}" width="1" height="1"/>`)
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" width="${size}" height="${size}">` +
    `<rect width="5" height="5" fill="#1e1b2e"/><g fill="${fg}">${cells.join('')}</g></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function shortAddress(address: string | null): string {
  if (!address) return ''
  return address.slice(0, 6) + '…' + address.slice(-4)
}
