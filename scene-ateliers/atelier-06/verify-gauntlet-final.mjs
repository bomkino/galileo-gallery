import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)))
for (const [path, label] of [
  ['verify-release.mjs', 'packet and canonical browser studies'],
  ['review-lab/verify.mjs', 'human review lab'],
]) {
  const result = spawnSync(process.execPath, [join(root, path)], { cwd: root, encoding: 'utf8' })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  assert.equal(result.status, 0, `${label} verification failed`)
  console.log(`PASS ${label}`)
}
console.log('Atelier 06 final gauntlet: all executable packet, browser, mutation, and review-journey gates passed.')
