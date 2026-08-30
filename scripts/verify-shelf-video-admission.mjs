import assert from "node:assert/strict"
import { admitShelfVideos } from "../src/shelfVideoAdmission.ts"

function source(index) {
    return {
        id: `video-${index}`,
        name: `Video ${index}.mp4`,
        type: "video",
        url: `reel-media://grant/${String(index).repeat(64)}`,
    }
}

function harness(modes, { suspendPaint = false, fallbackDelayMs = null } = {}) {
    const videos = []
    let active = 0
    let maximumActive = 0
    let paintCount = 0

    class FakeVideo {
        constructor(mode) {
            this.mode = mode
            this.source = ""
            this.readyState = 2
            this.videoWidth = 1920
            this.videoHeight = 1080
            this.pauseCalls = 0
            this.playCalls = 0
            this.loadCalls = 0
            this.removeCalls = 0
            this.cancelFrameCalls = 0
            this.assignedSources = []
            this.frameCallback = null
            this.muted = false
            this.playsInline = false
            this.preload = ""
            if (mode === "no-frame-api") this.requestVideoFrameCallback = undefined
        }

        set src(value) {
            if (!this.source && value) {
                active += 1
                maximumActive = Math.max(maximumActive, active)
                this.assignedSources.push(value)
            }
            this.source = value
        }

        get src() { return this.source }

        requestVideoFrameCallback(callback) {
            this.frameCallback = callback
            return 17
        }

        cancelVideoFrameCallback() { this.cancelFrameCalls += 1 }

        pause() { this.pauseCalls += 1 }

        play() {
            this.playCalls += 1
            return this.mode === "play-error" ? Promise.reject(new Error("play failed")) : Promise.resolve()
        }

        removeAttribute(name) {
            if (name === "src" && this.source) active -= 1
            if (name === "src") this.source = ""
        }

        remove() { this.removeCalls += 1 }

        load() {
            this.loadCalls += 1
            if (!this.source) return
            const callback = this.frameCallback
            if (this.mode === "error") queueMicrotask(() => this.onerror?.())
            if (this.mode === "valid") queueMicrotask(() => callback?.(10, { mediaTime: 0 }))
            if (this.mode === "invalid-width") queueMicrotask(() => {
                this.videoWidth = Number.NaN
                callback?.(10, { mediaTime: 0 })
            })
            if (this.mode === "invalid-time") queueMicrotask(() => callback?.(10, { mediaTime: Number.NaN }))
            if (this.mode === "not-ready") queueMicrotask(() => {
                this.readyState = 1
                callback?.(10, { mediaTime: 0 })
            })
        }
    }

    return {
        videos,
        get active() { return active },
        get maximumActive() { return maximumActive },
        get paintCount() { return paintCount },
        environment: {
            createVideo: () => {
                const video = new FakeVideo(modes.shift() ?? "valid")
                videos.push(video)
                return video
            },
            requestPaint: (callback) => {
                paintCount += 1
                if (!suspendPaint) queueMicrotask(() => callback(performance.now()))
                return paintCount
            },
            setTimeout: (callback, milliseconds) => setTimeout(callback, fallbackDelayMs ?? milliseconds),
            clearTimeout: (handle) => clearTimeout(handle),
            haveCurrentData: 2,
        },
    }
}

function assertRetired(video, expectedLoads = 2) {
    assert.equal(video.source, "")
    assert.equal(video.pauseCalls, 1)
    assert.equal(video.loadCalls, expectedLoads)
    assert.equal(video.removeCalls, 1)
}

async function run() {
    const preAborted = new AbortController()
    preAborted.abort()
    const untouched = harness(["valid"])
    await assert.rejects(admitShelfVideos([source(1)], { signal: preAborted.signal, environment: untouched.environment }), (error) => error.name === "AbortError")
    assert.equal(untouched.videos.length, 0, "pre-cancelled admission must not create a decoder")

    const success = harness(["valid", "valid", "valid"])
    const successSources = [source(1), source(2), source(3)]
    const admitted = await admitShelfVideos(successSources, { environment: success.environment })
    assert.deepEqual(admitted.map(({ id, url, width, height }) => ({ id, url, width, height })), successSources.map((item) => ({ id: item.id, url: item.url, width: 1920, height: 1080 })))
    assert.equal(success.maximumActive, 2, "no more than two original video sources may be live")
    assert.equal(success.active, 0)
    success.videos.forEach((video, index) => {
        assert.equal(video.muted, true)
        assert.equal(video.playsInline, true)
        assert.equal(video.preload, "auto")
        assert.equal(video.playCalls, 1)
        assert.equal(video.src, "")
        assert.equal(video.cancelFrameCalls, 1)
        assert.deepEqual(video.assignedSources, [successSources[index].url], "decoder must receive the unchanged original URL exactly once")
        assertRetired(video)
    })
    assert.equal(success.paintCount, 6, "each decoder must drain two paints before the batch resolves")

    for (const mode of ["invalid-width", "invalid-time", "not-ready"]) {
        const invalid = harness([mode])
        await assert.rejects(admitShelfVideos([source(4)], { environment: invalid.environment }), /invalid geometry or readiness/)
        assertRetired(invalid.videos[0])
        assert.equal(invalid.paintCount, 2)
    }

    const missingAPI = harness(["no-frame-api"])
    await assert.rejects(admitShelfVideos([source(5)], { environment: missingAPI.environment }), /frame-ready decoding is unavailable/)
    assertRetired(missingAPI.videos[0], 1)
    assert.equal(missingAPI.paintCount, 2)

    const playbackFailure = harness(["play-error"])
    await assert.rejects(admitShelfVideos([source(5)], { environment: playbackFailure.environment }), /original source could not play/)
    assertRetired(playbackFailure.videos[0])
    assert.equal(playbackFailure.paintCount, 2)

    const failedBatch = harness(["error", "pending", "valid"])
    await assert.rejects(admitShelfVideos([source(6), source(7), source(8)], { environment: failedBatch.environment }), /original source could not decode/)
    assert.equal(failedBatch.videos.length, 2, "first failure must prevent a third decoder from starting")
    assert.equal(failedBatch.active, 0)
    failedBatch.videos.forEach((video) => assertRetired(video))
    assert.equal(failedBatch.paintCount, 4)

    const cancelled = harness(["pending", "pending", "valid"])
    const cancellation = new AbortController()
    const cancelling = admitShelfVideos([source(1), source(2), source(3)], { signal: cancellation.signal, environment: cancelled.environment })
    await new Promise((resolve) => setImmediate(resolve))
    cancellation.abort()
    await assert.rejects(cancelling, (error) => error.name === "AbortError")
    assert.equal(cancelled.videos.length, 2)
    assert.equal(cancelled.active, 0)
    cancelled.videos.forEach((video) => assertRetired(video))
    assert.equal(cancelled.paintCount, 4)

    const timedOut = harness(["pending"])
    await assert.rejects(admitShelfVideos([source(9)], { timeoutMs: 5, environment: timedOut.environment }), /timed out/)
    assertRetired(timedOut.videos[0])
    assert.equal(timedOut.paintCount, 2)

    const hidden = harness(["valid"], { suspendPaint: true, fallbackDelayMs: 5 })
    const hiddenResult = await Promise.race([
        admitShelfVideos([source(10)], { environment: hidden.environment }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("hidden admission cleanup hung")), 100)),
    ])
    assert.equal(hiddenResult.length, 1)
    assert.equal(hidden.active, 0)
    assertRetired(hidden.videos[0])
    assert.equal(hidden.paintCount, 1, "a suspended renderer must fall back without waiting forever for a first paint")

    console.log("Verified: Shelf video admission uses original URLs, mandatory frame callbacks, two workers, fail-fast cancellation, exact decoder retirement, and bounded two-paint drain.")
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
