import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { send, type ChatMessage, type Match, type MatchPrediction } from '@/lib/bridge'
import { buildFeed } from '@/lib/chat'

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function MatchChat({
  match,
  predictions,
  messages,
  writable,
  localAuthor
}: {
  match: Match
  predictions: MatchPrediction[]
  messages: ChatMessage[]
  writable: boolean
  localAuthor: string
}) {
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const feed = buildFeed(match, predictions, messages)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [feed.length])

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    send({ cmd: 'send-message', matchId: match.id, text: trimmed })
    setText('')
  }

  return (
    <div className='flex h-full flex-col rounded-md border'>
      <div className='border-b px-4 py-2 text-sm font-medium'>Chat</div>

      <div className='flex-1 space-y-2 overflow-y-auto p-4'>
        {feed.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No messages yet. Say something.</p>
        ) : (
          feed.map((item) => {
            if (item.kind === 'event') {
              return (
                <div
                  key={`e-${item.event}-${item.ts}-${item.label}`}
                  className='flex justify-center'
                >
                  <span className='bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs'>
                    {item.label}
                  </span>
                </div>
              )
            }
            const mine = item.author === localAuthor
            return (
              <div
                key={`m-${item.seq}`}
                className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
              >
                <div className='text-muted-foreground flex items-baseline gap-2 text-xs'>
                  <span className='font-medium'>{mine ? 'You' : item.authorName}</span>
                  <span>{clock(item.ts)}</span>
                </div>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm break-words ${
                    mine ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  {item.text}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className='border-t p-3'>
        {writable ? (
          <div className='flex gap-2'>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder='Message'
              maxLength={2000}
            />
            <Button onClick={submit} disabled={!text.trim()}>
              Send
            </Button>
          </div>
        ) : (
          <p className='text-muted-foreground text-center text-xs'>Join the room to chat.</p>
        )}
      </div>
    </div>
  )
}
