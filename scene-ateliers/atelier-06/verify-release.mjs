import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)))
const core = spawnSync(process.execPath, [join(root, 'verify-final.mjs')], { cwd: root, encoding: 'utf8' })
process.stdout.write(core.stdout)
process.stderr.write(core.stderr)
assert.equal(core.status, 0, 'core Atelier 06 verification failed')

const entrypointFile = join(root, 'BROWSER_ENTRYPOINTS.json')
const manifest = JSON.parse(readFileSync(entrypointFile, 'utf8'))
assert.equal(manifest.version, 1)
const expectedScenes = ['light-table', 'before-after-slider', 'slide-anatomy-object', 'the-build']
assert.deepEqual(Object.keys(manifest.entrypoints).sort(), [...expectedScenes].sort())

const temp = mkdtempSync(join(tmpdir(), 'atelier06-browser-syntax-'))
let checks = 0
try {
  for (const scene of expectedScenes) {
    const relativePath = manifest.entrypoints[scene]
    const absolutePath = join(root, relativePath)
    const html = readFileSync(absolutePath, 'utf8')
    const moduleMatch = html.match(/<script\s+type="module">([\s\S]*?)<\/script>/i)
    assert.ok(moduleMatch, `${scene}: canonical browser entrypoint has no inline module`)
    const scriptPath = join(temp, `${scene}.mjs`)
    writeFileSync(scriptPath, moduleMatch[1], 'utf8')
    const syntax = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' })
    process.stdout.write(syntax.stdout)
    process.stderr.write(syntax.stderr)
    assert.equal(syntax.status, 0, `${scene}: canonical browser module does not parse`)
    for (const needle of ['44px', 'aria-live="polite"', 'keydown', 'pagehide', 'requestAnimationFrame', 'Pause', 'Reset']) {
      assert.ok(html.includes(needle), `${scene}: canonical browser entrypoint missing ${needle}`)
    }
    assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, `${scene}: external browser dependency`)
    checks += 1
    console.log(`PASS ${scene}: canonical browser module syntax and UX contract`)
  }
} finally {
  rmSync(temp, { recursive: true, force: true })
}

const fixedBeforeAfter = readFileSync(join(root, manifest.entrypoints['before-after-slider']), 'utf8')
assert.doesNotMatch(fixedBeforeAfter, /shiftKey\?\./)
assert.match(fixedBeforeAfter, /event\.shiftKey\s*\?\s*0\.1\s*:\s*0\.02/)
console.log('PASS before-after-slider: keyboard step parses and remains causal')
checks += 1

assert.equal(manifest.entrypoints['before-after-slider'], 'before-after-slider/prototype/index-final.html')
console.log('PASS browser manifest excludes the known failing Before / After specimen')
checks += 1

console.log(`Atelier 06 release verification: core gates plus ${checks} canonical browser-entrypoint gates passed.`)
