#if os(macOS)
import AppKit
import SwiftUI

/// A native NSSlider with only its paint replaced. Native keyboard/accessibility actions remain.
public struct StudioSlider: NSViewRepresentable {
    @Binding private var value: Double
    private let bounds: ClosedRange<Double>
    private let step: Double
    private let title: String
    private let editing: (Bool) -> Void
    @Environment(\.studioTheme) private var theme
    @Environment(\.isEnabled) private var enabled
    public init(_ title: String, value: Binding<Double>, in bounds: ClosedRange<Double>, step: Double = 0,
                onEditingChanged: @escaping (Bool) -> Void = { _ in }) {
        self.title = title; self._value = value; self.bounds = bounds; self.step = step; self.editing = onEditingChanged
    }
    public func makeCoordinator() -> Coordinator { Coordinator(self) }
    public func makeNSView(context: Context) -> NSSlider {
        let slider = TrackingSlider()
        slider.cell = StudioSliderCell()
        slider.controlSize = .small
        slider.isContinuous = true
        slider.target = context.coordinator
        slider.action = #selector(Coordinator.changed(_:))
        slider.trackingChanged = { [weak coordinator = context.coordinator] in coordinator?.tracking($0) }
        configure(slider, context: context)
        return slider
    }
    public func updateNSView(_ slider: NSSlider, context: Context) {
        context.coordinator.parent = self
        configure(slider, context: context)
    }
    private func configure(_ slider: NSSlider, context: Context) {
        slider.minValue = bounds.lowerBound; slider.maxValue = bounds.upperBound
        if context.coordinator.active == nil { slider.doubleValue = min(bounds.upperBound, max(bounds.lowerBound, value)) }
        slider.isEnabled = enabled && bounds.upperBound > bounds.lowerBound
        (slider as? TrackingSlider)?.increment = step > 0 ? step : (bounds.upperBound - bounds.lowerBound) / 100
        slider.setAccessibilityLabel(title)
        (slider.cell as? StudioSliderCell)?.theme = theme
        slider.needsDisplay = true
    }
    public static func dismantleNSView(_ view: NSSlider, coordinator: Coordinator) {
        coordinator.tracking(false)
        (view as? TrackingSlider)?.trackingChanged = nil
        view.target = nil; view.action = nil
    }
    public final class Coordinator: NSObject {
        fileprivate var parent: StudioSlider
        fileprivate var active: StudioSlider?
        fileprivate init(_ parent: StudioSlider) { self.parent = parent }
        fileprivate func tracking(_ started: Bool) {
            if started {
                guard active == nil else { return }
                active = parent; active?.editing(true)
            } else if let current = active {
                active = nil; current.editing(false)
            }
        }
        @objc fileprivate func changed(_ sender: NSSlider) {
            // Assistive actions can arrive outside mouse/key tracking. Give them their own gesture.
            let standalone = active == nil
            if standalone { tracking(true) }
            defer { if standalone { tracking(false) } }
            guard let current = active else { return }
            let proposed = sender.doubleValue
            let snapped = current.step > 0 ? current.bounds.lowerBound +
                ((proposed - current.bounds.lowerBound) / current.step).rounded() * current.step : proposed
            let clamped = min(current.bounds.upperBound, max(current.bounds.lowerBound, snapped))
            sender.doubleValue = clamped
            if current.value != clamped { current.value = clamped }
        }
    }
}
private final class TrackingSlider: NSSlider {
    var trackingChanged: ((Bool) -> Void)?
    var increment = 1.0
    override func mouseDown(with event: NSEvent) {
        trackingChanged?(true); defer { trackingChanged?(false) }
        super.mouseDown(with: event)
    }
    override func keyDown(with event: NSEvent) {
        trackingChanged?(true); defer { trackingChanged?(false) }
        switch event.keyCode {
        case 123, 125: adjust(-1)
        case 124, 126: adjust(1)
        default: super.keyDown(with: event)
        }
    }
    private func adjust(_ direction: Double) {
        guard isEnabled else { return }
        doubleValue = min(maxValue, max(minValue, doubleValue + direction * increment))
        if let action { sendAction(action, to: target) }
    }
    override func accessibilityPerformIncrement() -> Bool {
        guard isEnabled else { return false }; adjust(1); return true
    }
    override func accessibilityPerformDecrement() -> Bool {
        guard isEnabled else { return false }; adjust(-1); return true
    }
    override func scrollWheel(with event: NSEvent) { nextResponder?.scrollWheel(with: event) }
}
private final class StudioSliderCell: NSSliderCell {
    var theme = StudioTheme(appearance: .light)
    private func ns(_ rgb: StudioRGB) -> NSColor {
        NSColor(srgbRed: rgb.red, green: rgb.green, blue: rgb.blue, alpha: 1)
    }
    override func drawBar(inside rect: NSRect, flipped: Bool) {
        let track = NSRect(x: rect.minX, y: rect.midY - 1.5, width: rect.width, height: 3)
        ns(theme.separator).setFill(); NSBezierPath(roundedRect: track, xRadius: 1.5, yRadius: 1.5).fill()
        guard let slider = controlView as? NSSlider, slider.maxValue > slider.minValue else { return }
        let fraction = min(1, max(0, (slider.doubleValue - slider.minValue) / (slider.maxValue - slider.minValue)))
        let fill = NSRect(x: track.minX, y: track.minY, width: track.width * fraction, height: track.height)
        ns(isEnabled && theme.isActive ? theme.accent : theme.secondary).setFill()
        NSBezierPath(roundedRect: fill, xRadius: 1.5, yRadius: 1.5).fill()
    }
    override func drawKnob(_ knobRect: NSRect) {
        let diameter = min(12, min(knobRect.width, knobRect.height))
        let rect = NSRect(x: knobRect.midX - diameter/2, y: knobRect.midY - diameter/2, width: diameter, height: diameter)
        let path = NSBezierPath(ovalIn: rect)
        ns(theme.well).setFill(); path.fill()
        ns(theme.border).setStroke(); path.lineWidth = theme.increasedContrast ? 1.5 : 1; path.stroke()
    }
}
#endif
