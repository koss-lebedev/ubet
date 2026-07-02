import Jazzicon, { jsNumberForAddress } from 'react-jazzicon'

// Deterministic jazzicon avatar seeded by an identity address (or any stable
// hex key). The same seed always renders the same avatar, so a user looks
// identical across tournaments and views.
export function Avatar({ seed, size = 20 }: { seed: string | null; size?: number }) {
  const n = seed ? jsNumberForAddress(seed.startsWith('0x') ? seed : '0x' + seed) : 0
  return (
    <span
      className='inline-flex shrink-0 overflow-hidden rounded-full'
      style={{ width: size, height: size }}
    >
      <Jazzicon diameter={size} seed={n} />
    </span>
  )
}
