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

function initAudio() {
  Bun.spawn(['pactl', 'set-sink-volume', '@DEFAULT_SINK@', '100%'], {
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
  })
}

async function play(file: string) {
  const proc = Bun.spawn(['paplay', file], {
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`paplay exited with code ${exitCode}`)
  }
}

async function playRepeated(file: string, count: number) {
  for (let i = 0; i < count; i++) {
    await play(file)
  }
}

initAudio()

app.get('/play/:name', async (c) => {
  const name = c.req.param('name')
  const file = sounds[name]

  if (!file) return c.text('unknown sound', 404)

  const now = Date.now()
  if (now - (lastPlayed[name] || 0) < cooldownMs) {
    return c.text('cooldown')
  }

  lastPlayed[name] = now
  await play(file)

  return c.text('ok')
})

app.get('/play/:name/:count', async (c) => {
  const name = c.req.param('name')
  const file = sounds[name]
  if (!file) return c.text('unknown sound', 404)

  const count = Number.parseInt(c.req.param('count'), 10)
  if (!Number.isInteger(count) || count < 1) {
    return c.text('invalid repeat count', 400)
  }

  if (count > MAX_REPEAT) {
    return c.text(`repeat count too large (max ${MAX_REPEAT})`, 400)
  }

  const now = Date.now()
  if (now - (lastPlayed[name] || 0) < cooldownMs) {
    return c.text('cooldown')
  }

  lastPlayed[name] = now
  await playRepeated(file, count)

  return c.text('ok')
})

app.get('/p/:name', (c) => {
  const file = sounds[c.req.param('name')]
  if (file) {
    Bun.spawn(['paplay', file], {
      stdout: 'ignore',
      stderr: 'ignore',
      stdin: 'ignore',
      detached: true,
    })
  }
  return c.body(null, 204)
})

app.get('/', (c) => c.text('sound gateway alive'))

Bun.serve({
  fetch: app.fetch,
  port: 9567,
  hostname: '0.0.0.0',
})