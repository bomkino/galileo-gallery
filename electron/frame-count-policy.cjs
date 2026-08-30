function positiveFinite(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${label} must be a positive finite number.`)
    }
    return value
}

function decimalRational(value) {
    const [coefficient, exponentText] = String(value).toLowerCase().split("e")
    const [whole, fraction = ""] = coefficient.split(".")
    const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "")
    const exponent = Number(exponentText ?? 0) - fraction.length
    if (exponent >= 0) return { numerator: BigInt(digits) * (10n ** BigInt(exponent)), denominator: 1n }
    return { numerator: BigInt(digits), denominator: 10n ** BigInt(-exponent) }
}

function lightTableFrameCount(durationMs, fps) {
    const duration = decimalRational(positiveFinite(durationMs, "Light Table duration"))
    const rate = decimalRational(positiveFinite(fps, "Light Table frame rate"))
    const numerator = duration.numerator * rate.numerator
    const denominator = duration.denominator * rate.denominator * 1_000n
    const frames = (numerator + denominator - 1n) / denominator
    if (frames > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Light Table frame count exceeds the safe integer range.")
    return Math.max(1, Number(frames))
}

function pngFrameCountForScene(sceneId, durationMs, fps) {
    if (sceneId === "light-table") return lightTableFrameCount(durationMs, fps)
    if (sceneId === "the-shelf") return Math.max(1, Math.ceil(durationMs * fps / 1_000))
    return Math.max(1, Math.round(durationMs * fps / 1_000))
}

module.exports = { lightTableFrameCount, pngFrameCountForScene }
