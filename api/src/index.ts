import { Hono } from 'hono'

const app = new Hono()

const sounds: Record<string, string> = {
  ding: '/home/raais/sounds/rcp/chime_bell_ding.wav',
  fail: '/home/raais/sounds/rcp/chime_dim.wav',
  success: '/home/raais/sounds/rcp/chime_done.wav',
}

const cooldownMs = 300
const lastPlayed: Record<string, number> = {}

function initAudio() {
  Bun.spawn(['pactl', 'set-sink-volume', '@DEFAULT_SINK@', '100%'], {
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
  })
}

function play(file: string) {
  Bun.spawn(['paplay', file], {
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
    detached: true,
  })
}

initAudio()

app.get('/play/:name', (c) => {
  const name = c.req.param('name')
  const file = sounds[name]

  if (!file) return c.text('unknown sound', 404)

  const now = Date.now()
  if (now - (lastPlayed[name] || 0) < cooldownMs) {
    return c.text('cooldown')
  }

  lastPlayed[name] = now
  play(file)

  return c.text('ok')
})

app.get('/p/:name', (c) => {
  const file = sounds[c.req.param('name')]
  if (file) play(file)
  return c.body(null, 204)
})

app.get('/', (c) => c.text('sound gateway alive'))

export default app