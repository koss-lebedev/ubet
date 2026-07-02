import { Check } from 'lucide-react'
import { identicon, shortAddress } from '@/lib/identicon'

// Renders a participant as name + deterministic address avatar + short address,
// with a check when the display name is signed by that address. Collisions on
// name are allowed by design; the avatar + address are the disambiguators.
export function IdentityBadge({
  address,
  name,
  verified,
  showAddress = true
}: {
  address: string | null
  name: string
  verified: boolean
  showAddress?: boolean
}) {
  return (
    <span className='inline-flex items-center gap-1.5'>
      {address ? (
        <img src={identicon(address)} alt='' className='size-5 shrink-0 rounded-full' />
      ) : null}
      <span className='truncate font-medium'>{name || shortAddress(address) || 'anonymous'}</span>
      {verified ? (
        <Check className='size-3.5 shrink-0 text-emerald-400' aria-label='signed identity' />
      ) : null}
      {showAddress && address ? (
        <span className='text-muted-foreground font-mono text-xs'>{shortAddress(address)}</span>
      ) : null}
    </span>
  )
}
