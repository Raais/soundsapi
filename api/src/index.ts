import { Hono } from 'hono'

// --- Configuration ---
const CONFIG = {
  port: 9567,
  hostname: '0.0.0.0',
  cooldownMs: 300,
  maxRepeat: 10,
  repeatGapMs: 250,
}

const SOUNDS: Record<string, string> = {
  ding: '/home/raais/sounds/rcp/chime_bell_ding.wav',
  fail: '/home/raais/sounds/rcp/chime_dim.wav',
  success: '/home/raais/sounds/rcp/chime_done.wav',
}

// --- State ---
const lastPlayed = new Map<string, number>()

// --- Audio Utilities ---

/**
 * Synchronously forces the sink volume to 100% to ensure 
 * it completes before playback begins.
 */
function maximizeVolume() {
  Bun.spawnSync(['pactl', 'set-sink-volume', '@DEFAULT_SINK@', '100%'], {
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
  })
}

/**
 * Fire-and-forget playback (fast, non-blocking)
 */
function playAudio(file: string) {
  Bun.spawn(['paplay', file], {
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
    detached: true,
  })
}

/**
 * Maximizes volume and immediately plays the sound
 */
function playLoud(file: string) {
  maximizeVolume()
  playAudio(file)
}

/**
 * Repeat playback in background
 */
async function repeatInBackground(file: string, count: number) {
  maximizeVolume()

  for (let i = 0; i < count; i++) {
    playAudio(file)

    // Wait before next play (except on the last iteration)
    if (i < count - 1) {
      await Bun.sleep(CONFIG.repeatGapMs)
    }
  }
}

/**
 * Checks and updates the cooldown state for a given sound.
 * Returns true if allowed to play, false if in cooldown.
 */
function checkRateLimit(name: string): boolean {
  const now = Date.now()
  const last = lastPlayed.get(name) || 0
  
  if (now - last < CONFIG.cooldownMs) {
    return false
  }

  lastPlayed.set(name, now)
  return true
}

// --- Boot Sequence ---
function init() {
  maximizeVolume()
  if (SOUNDS.success) playAudio(SOUNDS.success)
}

init()

// --- Server Setup ---
const app = new Hono()

/**
 * Health check
 */
app.get('/', (c) => c.text('sound gateway alive'))

/**
 * Normal play (instant response)
 */
app.get('/play/:name', (c) => {
  const name = c.req.param('name')
  const file = SOUNDS[name]

  if (!file) return c.text('unknown sound', 404)
  if (!checkRateLimit(name)) return c.text('cooldown', 429)

  playLoud(file)
  return c.text('ok')
})

/**
 * Repeat endpoint
 * Example: /play/ding/3
 */
app.get('/play/:name/:count', (c) => {
  const name = c.req.param('name')
  const file = SOUNDS[name]

  if (!file) return c.text('unknown sound', 404)

  const count = parseInt(c.req.param('count'), 10)
  
  if (!Number.isInteger(count) || count < 1) {
    return c.text('invalid repeat count', 400)
  }

  if (count > CONFIG.maxRepeat) {
    return c.text(`repeat too large (max ${CONFIG.maxRepeat})`, 400)
  }

  if (!checkRateLimit(name)) return c.text('cooldown', 429)

  // Fire and forget (catch errors to prevent unhandled rejections crashing the process)
  repeatInBackground(file, count).catch(console.error)

  return c.text('ok')
})

/**
 * Raw fire-and-forget endpoint (no cooldown)
 */
app.get('/p/:name', (c) => {
  const file = SOUNDS[c.req.param('name')]
  if (file) playLoud(file)
  
  return c.body(null, 204)
})

// Start the server
Bun.serve({
  fetch: app.fetch,
  port: CONFIG.port,
  hostname: CONFIG.hostname,
})