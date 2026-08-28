import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const scenes = ['light-table', 'before-after-slider', 'slide-anatomy-object', 'the-build']
const required = [
  'S0_CHARTER_CANDIDATE.md', 'SCENE_DNA.md', 'CAPABILITY_AND_CONTROLS.json',
  'TIMELINE_AND_EVALUATOR.md', 'SOURCE_FIDELITY_ALPHA_AND_LOOK.md',
  'EDGE_RESOURCE_ACCESSIBILITY.md', 'PROVENANCE.md', 'TEST_VECTORS.json',
  'HUMAN_REVIEW_PACKET.md', 'prototype/core.mjs', 'prototype/index.html',
  'prototype/verify.mjs', 'evidence/EVIDENCE_MANIFEST.json',
  'evidence/canonical.svg', 'evidence/story-states.svg',
]
let passed = 0
const pass = (name) => { passed += 1; console.log(`PASS ${name}`) }
const text = (path) => readFileSync(path, 'utf8')
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
  )
}
function runNode(path, label) {
  const result = spawnSync(process.execPath, [path], { cwd: root, encoding: 'utf8' })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  assert.equal(result.status, 0, `${label} failed`)
  pass(label)
}

for (const scene of scenes) {
  for (const path of required) {
    const absolute = join(root, scene, path)
    assert.equal(existsSync(absolute), true, `${scene}/${path} missing`)
    assert.ok(statSync(absolute).size > 0, `${scene}/${path} empty`)
  }
  pass(`${scene}: packet completeness`)

  for (const path of ['CAPABILITY_AND_CONTROLS.json', 'TEST_VECTORS.json', 'evidence/EVIDENCE_MANIFEST.json']) {
    JSON.parse(text(join(root, scene, path)))
  }
  pass(`${scene}: JSON validity`)

  const human = text(join(root, scene, 'HUMAN_REVIEW_PACKET.md'))
  assert.match(human, /verdict:\s*pending/i)
  assert.doesNotMatch(human, /verdict:\s*(?:approved|accepted|pass)/i)
  pass(`${scene}: human verdict pending`)

  const source = text(join(root, scene, 'SOURCE_FIDELITY_ALPHA_AND_LOOK.md')).toLowerCase()
  assert.match(source, /opacity\s+[`*]?1[`*]?/)
  assert.ok(source.includes('filter `none`') || source.includes('filter none'))
  assert.ok(source.includes('normal blend') || source.includes('blend `normal`') || source.includes('blend mode `normal`'))
  assert.ok(source.includes('contain'))
  pass(`${scene}: source-neutral Clean contract`)

  const capability = JSON.parse(text(join(root, scene, 'CAPABILITY_AND_CONTROLS.json')))
  assert.equal(capability.roundTrip, 'exact-json-value-round-trip-required')
  assert.ok(capability.controls.length > 0)
  for (const control of capability.controls) {
    assert.equal(control.resettable, true, `${scene}/${control.id} not resettable`)
    assert.ok(control.causes.length > 0, `${scene}/${control.id} is inert`)
  }
  pass(`${scene}: causal controls`)

  const vectors = JSON.parse(text(join(root, scene, 'TEST_VECTORS.json')))
  assert.ok(vectors.vectors.length >= 15)
  assert.ok(vectors.mutationSensitivity.length >= 5)
  for (const needle of ['fixed', 'directed', 'reduced', 'remount']) {
    assert.ok(vectors.vectors.some((vector) => vector.id.includes(needle)), `${scene}: missing ${needle}`)
  }
  assert.ok(vectors.vectors.some((vector) => vector.expectError), `${scene}: no negative vector`)
  pass(`${scene}: behavioural vector breadth`)

  const verifier = text(join(root, scene, 'prototype/verify.mjs'))
  assert.doesNotMatch(verifier, /assert\.(?:ok|equal|strictEqual)\s*\(\s*true(?:\s*,\s*true)?\s*\)/)
  assert.doesNotMatch(verifier, /if\s*\(\s*false\s*\)/)
  assert.match(verifier, /mutation caught:/)
  pass(`${scene}: mutation-sensitive tests`)

  const html = text(join(root, scene, 'prototype/index.html'))
  for (const needle of ['44px', 'aria-live="polite"', 'pagehide', 'requestAnimationFrame', 'keydown', 'Pause', 'Reset']) {
    assert.ok(html.includes(needle), `${scene}: browser study missing ${needle}`)
  }
  pass(`${scene}: keyboard, lifecycle, touch-target UX`)

  runNode(join(root, scene, 'prototype/verify.mjs'), `${scene}: executable verifier`)
}

runNode(join(root, 'gauntlet/run-all.mjs'), 'cross-Scene executable gauntlet')

for (const file of walk(root)) {
  if (/\.(?:png|jpe?g|gif|webp|zip|gz|mp4|mov)$/i.test(file)) continue
  const raw = text(file)
  assert.doesNotMatch(raw, /gh[pousr]_[A-Za-z0-9_]{20,}/, `GitHub token in ${relative(root, file)}`)
  assert.doesNotMatch(raw, /sk-[A-Za-z0-9_-]{20,}/, `API key in ${relative(root, file)}`)
  assert.doesNotMatch(raw, /\/(?:Users|home)\/[^\s"']+/, `absolute user path in ${relative(root, file)}`)
  const scrubbed = raw
    .replaceAll('http://www.w3.org/2000/svg', '')
    .replaceAll('https://github.com/bomkino/galileo-gallery', '')
  assert.doesNotMatch(scrubbed, /https?:\/\/[^\s"')]+/, `external network reference in ${relative(root, file)}`)
}
pass('credential, path, and external-network scan')

const report = text(join(root, 'FINAL_GAUNTLET_REPORT.md')).toLowerCase()
for (const finding of ['always-pass', 'directed', 'reduced-motion', 'stable keyed nodes', 'mutation']) {
  assert.ok(report.includes(finding), `missing recorded finding: ${finding}`)
}
pass('substantive findings recorded')

const build = text(join(root, 'the-build/S0_CHARTER_CANDIDATE.md'))
assert.match(build, /G10C preflight/i)
assert.match(build, /11\.6 seconds/i)
assert.match(build, /7\.9 seconds/i)
assert.doesNotMatch(build, /production implementation complete/i)
pass('The Build remains blocked and truthful')

const anatomy = text(join(root, 'slide-anatomy-object/S0_CHARTER_CANDIDATE.md'))
assert.match(anatomy, /may not infer semantic image layers/i)
pass('Slide Anatomy remains flat-source')

console.log(`Atelier 06 final verification: ${passed} gates passed.`)
