#if os(macOS)
import SwiftUI

public extension StudioRGB {
    var color: Color { Color(.sRGB, red: red, green: green, blue: blue, opacity: 1) }
}
private struct StudioThemeKey: EnvironmentKey {
    static let defaultValue = StudioTheme(appearance: .light)
}
public extension EnvironmentValues {
    var studioTheme: StudioTheme {
        get { self[StudioThemeKey.self] }
        set { self[StudioThemeKey.self] = newValue }
    }
}
public extension View {
    /// The application supplies appearance. The package never changes NSApp or preferences.
    func studioTheme(_ theme: StudioTheme) -> some View { environment(\.studioTheme, theme) }
    func studioSurface(_ role: StudioSurfaceRole) -> some View { modifier(StudioSurface(role: role)) }
}
public enum StudioSurfaceRole { case window, panel, surround }
private struct StudioSurface: ViewModifier {
    @Environment(\.studioTheme) private var theme
    let role: StudioSurfaceRole
    func body(content: Content) -> some View {
        content.background((role == .panel ? theme.panel : role == .surround ? theme.surround : theme.window).color)
    }
}

public struct StudioButtonStyle: ButtonStyle {
    public enum Emphasis { case normal, primary, quiet }
    private let emphasis: Emphasis
    private let compact: Bool
    @Environment(\.studioTheme) private var theme
    @Environment(\.isEnabled) private var enabled
    @Environment(\.isFocused) private var focused
    @State private var hovering = false
    public init(_ emphasis: Emphasis = .normal, compact: Bool = false) {
        self.emphasis = emphasis; self.compact = compact
    }
    public func makeBody(configuration: Configuration) -> some View {
        let primary = emphasis == .primary && enabled
        let background = primary ? theme.accent : enabled && configuration.isPressed ? theme.pressed :
            enabled && hovering ? theme.hover : emphasis == .quiet ? theme.panel : theme.well
        let foreground = !enabled ? theme.secondary : primary ? theme.accent.readableForeground : theme.text
        configuration.label
            .studioType(.action)
            .foregroundStyle(foreground.color)
            .padding(.horizontal, compact ? 7 : 11)
            .frame(minWidth: compact ? 28 : 0, minHeight: 40)
            .background(background.color, in: RoundedRectangle(cornerRadius: 7))
            .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(
                emphasis == .quiet && !hovering ? Color.clear : theme.border.color,
                lineWidth: theme.lineWidth))
            .overlay {
                if focused && theme.isActive {
                    RoundedRectangle(cornerRadius: 10).strokeBorder(theme.focus.color, lineWidth: 2)
                        .padding(-3).allowsHitTesting(false)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 7))
            .onHover { hovering = $0 }
            .animation(theme.reduceMotion ? nil : .easeOut(duration: 0.09), value: hovering)
    }
}

/// Paint only. The app keeps its captured target, parsing, draft, undo and focus state.
public struct StudioTextFieldStyle: TextFieldStyle {
    private let focused: Bool
    private let invalid: Bool
    @Environment(\.studioTheme) private var theme
    @Environment(\.isEnabled) private var enabled
    public init(focused: Bool = false, invalid: Bool = false) { self.focused = focused; self.invalid = invalid }
    public func _body(configuration: TextField<Self._Label>) -> some View {
        configuration.textFieldStyle(.plain)
            .studioType(.input)
            .foregroundStyle((invalid ? theme.error : enabled ? theme.text : theme.secondary).color)
            .padding(.horizontal, 8).padding(.vertical, 5)
            .frame(minHeight: 40)
            .background(theme.well.color, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(
                invalid ? theme.error.color : focused && theme.isActive ? theme.focus.color : theme.border.color,
                lineWidth: invalid || focused && theme.isActive ? 1.5 : theme.lineWidth))
    }
}

public struct StudioChoice<Value: Hashable>: Identifiable {
    public let id: Value
    public let title: String
    public init(_ id: Value, _ title: String) { self.id = id; self.title = title }
}

/// Real buttons with stable option IDs. Focus is distinct from selected content.
public struct StudioChoiceBar<Value: Hashable>: View {
    private let title: String
    @Binding private var selection: Value
    private let choices: [StudioChoice<Value>]
    @Environment(\.studioTheme) private var theme
    @Environment(\.isEnabled) private var enabled
    @FocusState private var focused: Value?
    public init(_ title: String, selection: Binding<Value>, choices: [StudioChoice<Value>]) {
        self.title = title; self._selection = selection; self.choices = choices
    }
    public var body: some View {
        HStack(spacing: 3) {
            ForEach(choices) { choice in
                Button { if selection != choice.id { selection = choice.id } } label: {
                    Text(choice.title).studioType(.action)
                        .lineLimit(1).frame(maxWidth: .infinity, minHeight: 40)
                        .foregroundStyle((enabled ? theme.text : theme.secondary).color)
                        .background(selection == choice.id ? theme.well.color : Color.clear,
                                    in: RoundedRectangle(cornerRadius: 6))
                        .overlay(alignment: .bottom) {
                            if selection == choice.id {
                                RoundedRectangle(cornerRadius: 1).fill((theme.isActive ? theme.focus : theme.secondary).color)
                                    .frame(height: 2).padding(.horizontal, 12)
                            }
                        }
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(
                            focused == choice.id && theme.isActive ? theme.focus.color : Color.clear, lineWidth: 2))
                        .contentShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain).focused($focused, equals: choice.id)
                .accessibilityLabel(choice.title)
                .accessibilityAddTraits(selection == choice.id ? [.isSelected] : [])
                .help(choice.title)
            }
        }
        .padding(3).background(theme.window.color, in: RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .contain).accessibilityLabel(title)
        .onMoveCommand { direction in
            guard enabled, let focused, let index = choices.firstIndex(where: { $0.id == focused }), !choices.isEmpty else { return }
            let delta: Int
            switch direction { case .left: delta = -1; case .right: delta = 1; default: return }
            let next = min(choices.count - 1, max(0, index + delta))
            self.focused = choices[next].id
            if selection != choices[next].id { selection = choices[next].id }
        }
    }
}

/// A custom trigger around a genuine Menu/Picker: keyboard, checkmarks and dismissal stay native.
public struct StudioPicker<Selection: Hashable, Options: View>: View {
    private let title: String
    private let valueLabel: String
    private let showsLabel: Bool
    @Binding private var selection: Selection
    private let options: () -> Options
    @Environment(\.studioTheme) private var theme
    @Environment(\.isEnabled) private var enabled
    @State private var hovering = false
    public init(_ title: String, selection: Binding<Selection>, valueLabel: String,
                showsLabel: Bool = true, @ViewBuilder content: @escaping () -> Options) {
        self.title = title; self._selection = selection; self.valueLabel = valueLabel
        self.showsLabel = showsLabel; self.options = content
    }
    public var body: some View {
        HStack(spacing: 8) {
            if showsLabel { Text(title).studioType(.label).foregroundStyle(theme.text.color).accessibilityHidden(true) }
            Menu {
                Picker(title, selection: $selection, content: options).labelsHidden()
            } label: {
                // macOS can flatten a Menu label to native title/image. Paint the
                // surface outside the Menu rather than losing it inside that label.
                Text(valueLabel).studioType(.input).lineLimit(1)
            }
            .menuStyle(.borderlessButton).menuIndicator(.hidden)
            .padding(.leading, 9).padding(.trailing, 24)
            .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
            .foregroundStyle((enabled ? theme.text : theme.secondary).color)
            .background((hovering && enabled ? theme.hover : theme.well).color, in: RoundedRectangle(cornerRadius: 6))
            .overlay(alignment: .trailing) {
                Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
                    .foregroundStyle((enabled ? theme.text : theme.secondary).color)
                    .padding(.trailing, 9).allowsHitTesting(false).accessibilityHidden(true)
            }
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(theme.border.color, lineWidth: theme.lineWidth).allowsHitTesting(false))
            .accessibilityLabel(title).accessibilityValue(valueLabel)
            .help(valueLabel).onHover { hovering = $0 }
        }
    }
}
#endif
