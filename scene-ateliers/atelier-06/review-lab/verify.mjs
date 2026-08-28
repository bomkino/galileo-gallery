import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const directory = resolve(fileURLToPath(new URL('.', import.meta.url)))
const root = resolve(directory, '..')
const html = readFileSync(join(directory, 'index.html'), 'utf8')
const manifest = JSON.parse(readFileSync(join(root, 'BROWSER_ENTRYPOINTS.json'), 'utf8'))

for (const needle of [
  '44px', 'aria-live="polite"', 'Reset study',
  '<option value="16/9">16:9</option>',
  '<option value="9/16">9:16</option>',
  '<option value="1/1">1:1</option>',
  '<option value="4/5">4:5</option>',
  'VERDICT PENDING',
  'no Product integration',
]) {
  assert.ok(html.includes(needle), `review lab missing ${needle}`)
}

const paths = [...html.matchAll(/path:'([^']+)'/g)].map((match) => match[1])
const expected = Object.values(manifest.entrypoints).map((path) => `../${path}`)
assert.deepEqual(paths.sort(), expected.sort(), 'review lab must use canonical browser paths only')

assert.doesNotMatch(html, /https?:\/\//, 'review lab has an external dependency')
assert.doesNotMatch(html, /verdict:\s*(?:approved|accepted|pass)/i)

const script = html.match(/<script>([\s\S]*?)<\/script>/i)
assert.ok(script, 'review lab script missing')
const temp = mkdtempSync(join(tmpdir(), 'atelier06-review-lab-'))
try {
  const path = join(temp, 'review-lab.js')
  writeFileSync(path, script[1], 'utf8')
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  assert.equal(result.status, 0, 'review lab script does not parse')
} finally {
  rmSync(temp, { recursive: true, force: true })
}

console.log('PASS review lab: canonical paths, syntax, ratios, pending verdict, touch targets, and offline boundary')
