// Copies ANTHROPIC_API_KEY (and APP_PASSCODE, if set) from .env into the online Worker's secrets,
// piping each value straight into wrangler so it is never printed or written anywhere else.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
)
for (const name of ['ANTHROPIC_API_KEY', 'APP_PASSCODE']) {
  if (!env[name]) {
    console.log(`${name}: not set in .env, skipped`)
    continue
  }
  const r = spawnSync('npx', ['wrangler', 'secret', 'put', name], { input: env[name], stdio: ['pipe', 'inherit', 'inherit'], shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
