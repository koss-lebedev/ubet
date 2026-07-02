'use client'

import * as React from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ComboboxOption = { value: string; label: React.ReactNode; keywords: string }

function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results.',
  className
}: {
  options: ComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [activeIndex, setActiveIndex] = React.useState(0)
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([])
  const inputRef = React.useRef<HTMLInputElement>(null)

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.keywords.toLowerCase().includes(q))
  }, [options, query])

  const selected = options.find((o) => o.value === value)

  function selectOption(opt: ComboboxOption) {
    onValueChange(opt.value)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[activeIndex]
      if (opt) selectOption(opt)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  React.useEffect(() => {
    setActiveIndex(0)
  }, [query])

  React.useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setQuery('')
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type='button'
          data-placeholder={selected ? undefined : ''}
          className={cn(
            'border-input data-[placeholder]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        >
          <span className='flex min-w-0 items-center gap-2 truncate'>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className='size-4 shrink-0 opacity-50' />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align='start'
          sideOffset={4}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
          className='bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 w-[var(--radix-popover-trigger-width)] origin-(--radix-popover-content-transform-origin) overflow-hidden rounded-md border p-0 shadow-md'
        >
          <div className='border-b p-1'>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className='placeholder:text-muted-foreground w-full rounded-sm bg-transparent px-2 py-1.5 text-sm outline-none'
            />
          </div>
          <div className='max-h-64 overflow-y-auto p-1'>
            {filtered.length === 0 ? (
              <p className='text-muted-foreground px-2 py-4 text-center text-sm'>{emptyText}</p>
            ) : (
              filtered.map((opt, i) => (
                <div
                  key={opt.value}
                  ref={(el) => {
                    itemRefs.current[i] = el
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => selectOption(opt)}
                  className={cn(
                    'flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm select-none',
                    i === activeIndex && 'bg-accent text-accent-foreground'
                  )}
                >
                  <Check
                    className={cn(
                      'size-4 shrink-0',
                      opt.value === value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className='truncate'>{opt.label}</span>
                </div>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { Combobox }
