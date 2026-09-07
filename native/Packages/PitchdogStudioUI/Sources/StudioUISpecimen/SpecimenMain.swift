import AppKit
import SwiftUI
import PitchdogStudioUI

struct Specimen: View {
    @State private var tab = "Scene"
    @State private var format = "Fit"
    @State private var number = "36"
    @State private var amount = 0.4
    @State private var dark = false
    @State private var contrast = false
    @State private var motion = false
    @FocusState private var fieldFocused: Bool
    private var theme: StudioTheme {
        StudioTheme(appearance: dark ? .dark : .light, increasedContrast: contrast, reduceMotion: motion)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Studio controls").font(.system(size: 20, weight: .semibold))
            HStack { Toggle("Dark", isOn: $dark); Toggle("Higher contrast", isOn: $contrast); Toggle("Reduce motion", isOn: $motion) }
            StudioChoiceBar("Inspector", selection: $tab, choices: [.init("Scene", "Scene"), .init("Media", "Media")])
            StudioPicker("Framing", selection: $format, valueLabel: format) {
                Text("Fit").tag("Fit"); Text("Fill").tag("Fill")
            }
            HStack { Text("Spacing"); Spacer(); TextField("Spacing", text: $number)
                    .textFieldStyle(StudioTextFieldStyle(focused: fieldFocused)).focused($fieldFocused).frame(width: 96) }
            StudioSlider("Spacing", value: $amount, in: 0...1, step: 0.01).frame(height: 24)
            HStack {
                Button("Cancel") {}.buttonStyle(StudioButtonStyle())
                Button("Apply") {}.buttonStyle(StudioButtonStyle(.primary))
                Button("Unavailable") {}.buttonStyle(StudioButtonStyle()).disabled(true)
            }
            TextField("Invalid value", text: .constant("Not a number")).textFieldStyle(StudioTextFieldStyle(invalid: true))
            Text("The specimen owns no documents, media, export or preferences.")
                .font(.system(size: 12)).foregroundStyle(theme.secondary.color)
        }
        .padding(24).frame(width: 420).background(theme.panel.color).foregroundStyle(theme.text.color)
        .studioTheme(theme).preferredColorScheme(dark ? .dark : .light)
    }
}
@main struct SpecimenMain {
    @MainActor static func main() {
        let app = NSApplication.shared; app.setActivationPolicy(.regular)
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 470, height: 440),
                              styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "Pitchdog Studio UI — developer specimen"
        window.contentView = NSHostingView(rootView: Specimen())
        window.center(); window.makeKeyAndOrderFront(nil); app.activate(ignoringOtherApps: true)
        withExtendedLifetime(window) { app.run() }
    }
}
