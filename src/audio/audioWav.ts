const MAX_DIAGNOSTIC_SAMPLES = 8_000_000

function formatError(message: string): never { throw new Error(`Diagnostic WAV invalid: ${message}`) }

export function encodePcm16Wav(interleaved: Float32Array, sampleRate: number, channels: 1 | 2) {
    if (!(interleaved instanceof Float32Array) || interleaved.length < 1 || interleaved.length > MAX_DIAGNOSTIC_SAMPLES || interleaved.length % channels !== 0) formatError("PCM length is unsupported.")
    if (!Number.isSafeInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000 || ![1, 2].includes(channels)) formatError("format is unsupported.")
    const dataBytes = interleaved.length * 2
    const buffer = new Uint8Array(44 + dataBytes)
    const view = new DataView(buffer.buffer)
    const text = (offset: number, value: string) => Array.from(value).forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)))
    text(0, "RIFF")
    view.setUint32(4, 36 + dataBytes, true)
    text(8, "WAVE")
    text(12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, channels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * channels * 2, true)
    view.setUint16(32, channels * 2, true)
    view.setUint16(34, 16, true)
    text(36, "data")
    view.setUint32(40, dataBytes, true)
    for (let index = 0; index < interleaved.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, interleaved[index]))
        view.setInt16(44 + index * 2, sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), true)
    }
    return buffer
}

export function inspectPcm16Wav(bytes: Uint8Array) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 46) formatError("file is too small.")
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length))
    if (text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE" || text(12, 4) !== "fmt " || text(36, 4) !== "data") formatError("container identity is unsupported.")
    const channels = view.getUint16(22, true)
    const sampleRate = view.getUint32(24, true)
    const dataBytes = view.getUint32(40, true)
    if (view.getUint16(20, true) !== 1 || view.getUint16(34, true) !== 16 || ![1, 2].includes(channels) || dataBytes + 44 !== bytes.length || dataBytes % (channels * 2) !== 0) formatError("PCM layout is unsupported.")
    let peak = 0
    const samples = new Int16Array(dataBytes / 2)
    for (let index = 0; index < samples.length; index += 1) {
        samples[index] = view.getInt16(44 + index * 2, true)
        peak = Math.max(peak, Math.abs(samples[index] / (samples[index] < 0 ? 32768 : 32767)))
    }
    return { sampleRate, channels: channels as 1 | 2, sampleFrames: dataBytes / (channels * 2), peak, samples }
}
