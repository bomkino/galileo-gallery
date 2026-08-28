import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const scenes = ['light-table', 'before-after-slider', 'slide-anatomy-object', 'the-build']
const required = [
  'S0_CHARTER_CANDIDATE.md',
  'SCENE_DNA.md',
  'CAPABILITY_AND_CONTROLS.json',
  'TIMELINE_AND_EVALUATOR.md',
  'SOURCE_FIDELITY_ALPHA_AND_LOOK.md',
  'EDGE_RESOURCE_ACCESSIBILITY.md',
  'PROVENANCE.md',
  'TEST_VECTORS.json',
  'HUMAN_REVIEW_PACKET.md',
  'prototype/core.mjs',
  'prototype/index.html',
  'prototype/verify.mjs',
  'evidence/EVIDENCE_MANIFEST.json',
  'evidence/canonical.svg',
  'evidence/story-states.svg',
]

let checks = 0
const pass = (name) => {
  checks += 1
  console.log(`PASS ${name}`)
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
  )
}

for (const scene of scenes) {
  for (const path of required) {
    const absolute = join(root, scene, path)
    assert.equal(existsSync(absolute), true, `${scene}/${path} is missing`)
    assert.ok(statSync(absolute).size > 0, `${scene}/${path} is empty`)
  }
  pass(`${scene}: complete required packet`)
}

for (const scene of scenes) {
  for (const json of ['CAPABILITY_AND_CONTROLS.json', 'TEST_VECTORS.json', 'evidence/EVIDENCE_MANIFEST.json']) {
    JSON.parse(readFileSync(join(root, scene, json), 'utf8'))
  }
  pass(`${scene}: JSON parses`)
}

for (const scene of scenes) {
  const result = spawnSync(process.execPath, [join(root, scene, 'prototype/verify.mjs')], {
    encoding: 'utf8',
    cwd: root,
  })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  assert.equal(result.status, 0, `${scene} verifier failed`)
  pass(`${scene}: substantive verifier`)
}

const crossScene = spawnSync(process.execPath, [join(root, 'gauntlet/run-all.mjs')], {
  encoding: 'utf8',
  cwd: root,
})
process.stdout.write(crossScene.stdout)
process.stderr.write(crossScene.stderr)
assert.equal(crossScene.status, 0, 'cross-Scene gauntlet failed')
pass('cross-Scene gauntlet')

for (const scene of scenes) {
  const human = readFileSync(join(root, scene, 'HUMAN_REVIEW_PACKET.md'), 'utf8')
  assert.match(human, /verdict:\s*pending/i)
  assert.doesNotMatch(human, /verdict:\s*(?:pass|approved|accepted)/i)
  pass(`${scene}: human verdict remains pending`)
}

for (const scene of scenes) {
  const source = readFileSync(join(root, scene, 'SOURCE_FIDELITY_ALPHA_AND_LOOK.md'), 'utf8').toLowerCase()
  assert.match(source, /opacity\s+[`*]?1[`*]?/)
  assert.ok(source.includes('filter `none`') || source.includes('filter none'), `${scene}: missing filter-none invariant`)
  assert.ok(
    source.includes('normal blend') || source.includes('blend `normal`') || source.includes('blend mode `normal`'),
    `${scene}: missing normal-blend invariant`,
  )
  assert.ok(source.includes('contain'), `${scene}: missing contain-default discussion`)
  pass(`${scene}: semantic source-clean contract`)
}

for (const scene of scenes) {
  const capability = JSON.parse(readFileSync(join(root, scene, 'CAPABILITY_AND_CONTROLS.json'), 'utf8'))
  assert.equal(capability.roundTrip, 'exact-json-value-round-trip-required')
  assert.ok(Array.isArray(capability.controls) && capability.controls.length > 0)
  for (const control of capability.controls) {
    assert.equal(control.resettable, true, `${scene}/${control.id}: control must reset`)
    assert.ok(Array.isArray(control.causes) && control.causes.length > 0, `${scene}/${control.id}: control must be causal`)
  }
  pass(`${scene}: controls causal, bounded, resettable`)
}

for (const scene of scenes) {
  const vectors = JSON.parse(readFileSync(join(root, scene, 'TEST_VECTORS.json'), 'utf8'))
  assert.ok(vectors.vectors.length >= 15, `${scene}: insufficient behavioural vectors`)
  assert.ok(vectors.mutationSensitivity.length >= 5, `${scene}: insufficient mutation coverage`)
  for (const needle of ['fixed', 'directed', 'reduced', 'remount']) {
    assert.ok(vectors.vectors.some((vector) => vector.id.includes(needle)), `${scene}: missing ${needle} vector`)
  }
  assert.ok(vectors.vectors.some((vector) => vector.expectError), `${scene}: missing negative vector`)
  pass(`${scene}: vector breadth and negative coverage`)
}

for (const scene of scenes) {
  const verifier = readFileSync(join(root, scene, 'prototype/verify.mjs'), 'utf8')
  assert.doesNotMatch(verifier, /assert\.(?:ok|equal|strictEqual)\s*\(\s*true(?:\s*,\s*true)?\s*\)/)
  assert.doesNotMatch(verifier, /if\s*\(\s*false\s*\)/)
  assert.match(verifier, /mutation caught:/)
  pass(`${scene}: no literal always-pass assertion; mutation checks present`)
}

for (const scene of scenes) {
  const html = readFileSync(join(root, scene, 'prototype/index.html'), 'utf8')
  assert.match(html, /44px/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /pagehide/)
  assert.match(html, /requestAnimationFrame/)
  assert.match(html, /Pause/)
  assert.match(html, /Reset/)
  assert.match(html, /keydown/)
  pass(`${scene}: browser UX and lifecycle hooks`)
}

const forbidden = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /\/(?:Users|home)\/[^\s"']+/,
  /https?:\/\/(?!github\.com\/bomkino\/galileo-gallery)[^\s"')]+/,
]
for (const file of walk(root)) {
  if (/\.(?:png|jpe?g|gif|webp|zip|gz|mp4|mov)$/i.test(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const pattern of forbidden) {
    assert.doesNotMatch(text, pattern, `sensitive or external reference in ${relative(root, file)}`)
  }
}
pass('credential, absolute-path, and external-network scan')

const finalReport = readFileSync(join(root, 'FINAL_GAUNTLET_REPORT.md'), 'utf8').toLowerCase()
for (const finding of ['always-pass', 'directed', 'reduced-motion', 'stable keyed nodes', 'mutation']) {
  assert.ok(finalReport.includes(finding), `final report missing ${finding}`)
}
pass('gauntlet findings recorded')

const buildCharter = readFileSync(join(root, 'the-build/S0_CHARTER_CANDIDATE.md'), 'utf8')
assert.match(buildCharter, /G10C preflight/i)
assert.match(buildCharter, /7\.9 seconds/i)
assert.match(buildCharter, /11\.6 seconds/i)
assert.doesNotMatch(buildCharter, /production implementation complete/i)
pass('The Build remains an honest G10C preflight')

const anatomyCharter = readFileSync(join(root, 'slide-anatomy-object/S0_CHARTER_CANDIDATE.md'), 'utf8')
assert.match(anatomyCharter, /may not infer semantic image layers/i)
pass('Slide Anatomy remains flat-source')

console.log(`Atelier 06 packet verification v2: ${checks} gates passed.`)
