const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex")

async function runG05RendererSmoke(window, outputDirectory, mode) {
    fs.mkdirSync(outputDirectory, { recursive: true })
    const journey = await window.webContents.executeJavaScript(`(async () => {
        const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
        const required = (selector) => {
            const node = document.querySelector(selector)
            if (!node) throw new Error('Missing G05 selector: ' + selector)
            return node
        }
        const waitFor = async (predicate, label) => {
            for (let attempt = 0; attempt < 240; attempt += 1) {
                const value = predicate()
                if (value) return value
                await wait(50)
            }
            throw new Error('Timed out waiting for ' + label + '; notice: ' + (document.querySelector('[role="status"]')?.textContent?.trim() ?? 'missing'))
        }
        await waitFor(() => document.querySelector('[data-g02-tracer="quiet-carousel-v1"]'), 'Quiet Carousel')
        if (!window.galleryHost) throw new Error('Gallery HostPort missing.')
        const notice = () => required('[role="status"]').textContent.trim()
        const click = (selector) => required(selector).click()
        const setRange = (selector, value) => {
            const input = required(selector)
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value))
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
        }
        const mode = ${JSON.stringify(mode)}
        const pcmCheck = async (label) => {
            await waitFor(() => required('[data-g05-audio="timeline"]').dataset.g05DiagnosticHash === '', label + ' invalidation')
            click('[data-g05-action="check-mix"]')
            const hash = await waitFor(() => /^[a-f0-9]{64}$/.test(required('[data-g05-audio="timeline"]').dataset.g05DiagnosticHash) && required('[data-g05-audio="timeline"]').dataset.g05DiagnosticHash, label + ' PCM hash')
            return { hash, diagnostic: required('[data-g05-audio="timeline"] summary > span:last-child').textContent.trim() }
        }
        let matrix = null
        let preview = null
        let importBusy = null
        required('[data-g05-audio="timeline"]').open = true
        if (mode === 'save') {
            click('[data-g02-action="fixture"]')
            await wait(0)
            importBusy = {
                ariaBusy: required('[data-g02-tracer="quiet-carousel-v1"]').getAttribute('aria-busy'),
                projectActionsDisabled: Array.from(document.querySelectorAll('.qc-project-actions button')).every((button) => button.disabled),
                cancelVisible: Boolean(document.querySelector('[data-g05-action="cancel"]')),
                inspectorDisabled: required('[data-g02-control="frame-size"]').disabled,
            }
            await waitFor(() => /source frame/.test(notice()), 'media import')
            click('[data-g05-action="soundtrack"]')
            await waitFor(() => /Soundtrack added/.test(notice()), 'soundtrack verification')
            setRange('[data-g02-control="playhead"]', 1000)
            await waitFor(() => document.querySelector('[data-g02-tracer="quiet-carousel-v1"]')?.dataset.timeMs === '1000', 'one-second audio placement')
            click('[data-g05-action="presenter"]')
            await waitFor(() => /Presenter added/.test(notice()), 'presenter verification')
            matrix = {}
            matrix.baseline = await pcmCheck('baseline')
            setRange('[data-g05-control="soundtrack-gain"]', 0.6)
            matrix.gain = await pcmCheck('gain change')
            setRange('[data-g05-control="soundtrack-gain"]', 1)
            matrix.gainReset = await pcmCheck('gain reset')
            click('[data-g05-control="presenter-mute"]')
            matrix.presenterMuted = await pcmCheck('presenter mute')
            click('[data-g05-control="presenter-mute"]')
            matrix.presenterReset = await pcmCheck('presenter reset')
            click('[data-g05-control="soundtrack-solo"]')
            matrix.soundtrackSolo = await pcmCheck('soundtrack solo')
            click('[data-g05-control="soundtrack-solo"]')
            matrix.soloReset = await pcmCheck('solo reset')
            click('[data-g05-control="master-mute"]')
            matrix.masterMuted = await pcmCheck('master mute')
            click('[data-g05-control="master-mute"]')
            matrix.masterReset = await pcmCheck('master reset')
            click('[data-g05-control="duck"]')
            matrix.ducking = await pcmCheck('ducking')
            setRange('[data-g05-control="soundtrack-gain"]', 0.6)
            matrix.final = await pcmCheck('final authored mix')
            click('[data-g05-action="preview"]')
            const previewNotice = await waitFor(() => /^(Previewing|Preview unavailable)/.test(notice()) && notice(), 'preview scheduling result')
            if (previewNotice.startsWith('Previewing')) {
                await waitFor(() => document.querySelector('[data-g05-action="cancel"]'), 'preview stop action')
                click('[data-g05-action="cancel"]')
                await waitFor(() => /Audio work cancelled/.test(notice()), 'preview stop')
                preview = { available: true, stopped: true }
            } else preview = { available: false, reason: previewNotice }
            click('[data-g02-action="save"]')
            await waitFor(() => /Saved portable Project/.test(notice()), 'portable Project save')
        } else {
            click('[data-g02-action="reload"]')
            await waitFor(() => /Opened portable Project/.test(notice()), 'portable Project reopen')
            await waitFor(() => document.querySelectorAll('.qc-waveform i').length >= 96, 'waveform regeneration')
            setRange('[data-g02-control="playhead"]', 1000)
            await waitFor(() => document.querySelector('[data-g02-tracer="quiet-carousel-v1"]')?.dataset.timeMs === '1000', 'reopened one-second probe')
            click('[data-g05-action="check-mix"]')
            await waitFor(() => /Checked \d+ frames/.test(required('[data-g05-audio="timeline"] summary > span:last-child').textContent), 'reopened PCM mix diagnostic')
        }
        const root = required('[data-g02-tracer="quiet-carousel-v1"]')
        const lanes = Array.from(document.querySelectorAll('[data-g05-lane]')).map((lane) => ({
            role: lane.dataset.g05Lane,
            gain: Number(lane.querySelector('input[type="range"]')?.value),
            muted: lane.querySelector('[data-g05-control$="-mute"]')?.classList.contains('is-active') ?? false,
            solo: lane.querySelector('[data-g05-control$="-solo"]')?.classList.contains('is-active') ?? false,
            waveformBuckets: lane.querySelectorAll('.qc-waveform i').length,
        }))
        const html = document.documentElement.outerHTML
        return {
            mode,
            identity: await window.galleryHost.identity(),
            notice: notice(),
            audioLaneCount: Number(root.dataset.audioLanes),
            lanes,
            ducking: required('[data-g05-control="duck"]').classList.contains('is-active'),
            masterGain: Number(required('[data-g05-control="master-gain"]').value),
            masterMuted: required('[data-g05-control="master-mute"]').classList.contains('is-active'),
            diagnostic: required('[data-g05-audio="timeline"] summary > span:last-child').textContent.trim(),
            diagnosticHash: required('[data-g05-audio="timeline"]').dataset.g05DiagnosticHash,
            matrix,
            importBusy,
            preview,
            waveformReady: Array.from(document.querySelectorAll('[data-g05-lane]')).every((lane) => lane.dataset.g05WaveformReady === 'true'),
            waveformEnergy: Array.from(document.querySelectorAll('[data-g05-lane]')).reduce((sum, lane) => sum + Number(lane.dataset.g05WaveformEnergy || 0), 0),
            rawPathVisible: [${JSON.stringify(process.env.REEL_G05_PRESENTER_SOURCE ?? "__no-presenter__")}, ${JSON.stringify(process.env.REEL_G05_SOUNDTRACK_SOURCE ?? "__no-soundtrack__")}, ${JSON.stringify(process.env.REEL_G05_VIDEO_SOURCE ?? "__no-video__")}].some((value) => html.includes(value)),
            grantInDataset: Array.from(document.querySelectorAll('*')).some((node) => Object.values(node.dataset).some((value) => String(value).includes('reel-media://'))),
        }
    })()`)
    const image = await window.webContents.capturePage()
    const png = image.toPNG()
    const screenshot = path.join(outputDirectory, `g05-${mode}.png`)
    fs.writeFileSync(screenshot, png)
    const receipt = {
        schema: "galileo-gallery-g05-renderer-receipt-v1",
        capturedAt: new Date().toISOString(),
        platform: process.platform,
        architecture: process.arch,
        electron: process.versions.electron,
        journey,
        capture: { file: path.basename(screenshot), bytes: png.length, sha256: sha256(png), size: image.getSize() },
    }
    fs.writeFileSync(path.join(outputDirectory, `renderer-${mode}.json`), `${JSON.stringify(receipt, null, 2)}\n`)
}

module.exports = { runG05RendererSmoke }
