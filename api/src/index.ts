import { Hono } from 'hono'

const app = new Hono()

const sounds: Record<string, string> = {
  ding: '/home/raais/sounds/rcp/chime_bell_ding.wav',
  fail: '/home/raais/sounds/rcp/chime_dim.wav',
  success: '/home/raais/sounds/rcp/chime_done.wav',
}

const cooldownMs = 300
const lastPlayed: Record<string, number> = {}
const MAX_REPEAT = 10

/**
 * Fire-and-forget playback (fast, non-blocking)
 */
function playNow(file: string) {
  // 1. Force sink volume to 100% synchronously before playing
  Bun.spawnSync(['pactl', 'set-sink-volume', '@DEFAULT_SINK@', '100%'])

  // 2. Play the sound asynchronously
  Bun.spawn(['paplay', file], {
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
    detached: true,
  })
}

function initAudio() {
  Bun.spawn(['pactl', 'set-sink-volume', '@DEFAULT_SINK@', '100%'], {
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
  })

  // play startup sound
  const file = sounds['success']
  if (file) playNow(file)
}

/**
 * Sleep helper
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Repeat playback in background (sequential-ish)
 */
async function repeatInBackground(file: string, count: number, gapMs = 250) {
  for (let i = 0; i < count; i++) {
    playNow(file)

    // wait before next play (except last)
    if (i < count - 1) {
      await sleep(gapMs)
    }
  }
}

initAudio()

/**
 * Normal play (instant response)
 */
app.get('/play/:name', (c) => {
  const name = c.req.param('name')
  const file = sounds[name]

  if (!file) return c.text('unknown sound', 404)

  const now = Date.now()
  if (now - (lastPlayed[name] || 0) < cooldownMs) {
    return c.text('cooldown')
  }

  lastPlayed[name] = now
  playNow(file)

  return c.text('ok')
})

/**
 * Repeat endpoint
 * Example: /play/ding/3
 */
app.get('/play/:name/:count', (c) => {
  const name = c.req.param('name')
  const file = sounds[name]

  if (!file) return c.text('unknown sound', 404)

  const count = Number.parseInt(c.req.param('count'), 10)
  if (!Number.isInteger(count) || count < 1) {
    return c.text('invalid repeat count', 400)
  }

  if (count > MAX_REPEAT) {
    return c.text(`repeat too large (max ${MAX_REPEAT})`, 400)
  }

  const now = Date.now()
  if (now - (lastPlayed[name] || 0) < cooldownMs) {
    return c.text('cooldown')
  }

  lastPlayed[name] = now

  // fire and forget (do NOT await)
  repeatInBackground(file, count).catch(() => {})

  return c.text('ok')
})

/**
 * Raw fire-and-forget endpoint (no cooldown)
 */
app.get('/p/:name', (c) => {
  const file = sounds[c.req.param('name')]
  if (file) playNow(file)
  return c.body(null, 204)
})

app.get('/', (c) => c.text('sound gateway alive'))

Bun.serve({
  fetch: app.fetch,
  port: 9567,
  hostname: '0.0.0.0',
})