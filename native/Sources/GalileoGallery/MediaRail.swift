import AppKit
import SwiftUI
import UniformTypeIdentifiers
import GalileoCore
import GalileoNative
import PitchdogStudioUI

/// App-owned table interaction. The shared package only paints the existing rows.
struct MediaRail: NSViewRepresentable {
    let session: EditorSession
    let playback: PlaybackModel
    let replaceMedia: () -> Void
    let importProviders: ([NSItemProvider]) -> Bool
    @Environment(\.studioTheme) private var theme

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView()
        let table = MediaTable()
        table.addTableColumn(NSTableColumn(identifier: .init("media")))
        table.headerView = nil
        table.allowsMultipleSelection = true
        table.allowsEmptySelection = true
        table.rowHeight = 54
        table.intercellSpacing = NSSize(width: 0, height: 0)
        table.style = .sourceList
        table.columnAutoresizingStyle = .lastColumnOnlyAutoresizingStyle
        table.backgroundColor = .clear
        table.setAccessibilityIdentifier("galileo.media-list")
        table.setAccessibilityLabel("Media")
        table.registerForDraggedTypes([Coordinator.moveType, .fileURL])
        table.setDraggingSourceOperationMask(.move, forLocal: true)
        table.setDraggingSourceOperationMask([], forLocal: false)
        table.dataSource = context.coordinator
        table.delegate = context.coordinator
        table.owner = context.coordinator
        scroll.documentView = table
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        context.coordinator.table = table
        return scroll
    }
    func updateNSView(_ scroll: NSScrollView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.refresh()
    }
    static func dismantleNSView(_ scroll: NSScrollView, coordinator: Coordinator) {
        coordinator.parent.session.cancelMediaMove()
        coordinator.table?.delegate = nil
        coordinator.table?.dataSource = nil
        coordinator.table?.owner = nil
    }

    @MainActor final class Coordinator: NSObject, NSTableViewDataSource, NSTableViewDelegate {
        static let moveType = NSPasteboard.PasteboardType("dog.pitch.galileo.media-move")
        var parent: MediaRail
        weak var table: MediaTable?
        var items: [MediaItem] = []
        var updating = false
        var token: UUID?
        var query = ""
        init(_ parent: MediaRail) { self.parent = parent }
        func refresh() {
            guard let table else { return }
            let session = parent.session
            let next = session.project.items.filter { session.mediaQuery.isEmpty || $0.name.localizedCaseInsensitiveContains(session.mediaQuery) }
            updating = true
            defer { updating = false }
            let changedOrder = items.map(\.id) != next.map(\.id)
            items = next
            if changedOrder { table.reloadData() }
            else {
                for row in items.indices {
                    if let cell = table.view(atColumn: 0, row: row, makeIfNecessary: false) as? MediaCell {
                        cell.show(items[row], workspace: session.workspace, theme: parent.theme)
                    }
                }
            }
            let selected = IndexSet(items.indices.filter { session.selection.contains(items[$0].id) })
            if table.selectedRowIndexes != selected { table.selectRowIndexes(selected, byExtendingSelection: false) }
            if let token, !session.acceptsMediaMove(token) { table.setDropRow(-1, dropOperation: .above) }
            if !query.isEmpty && session.mediaQuery.isEmpty, let first = selected.first { table.scrollRowToVisible(first) }
            query = session.mediaQuery
        }
        nonisolated func numberOfRows(in tableView: NSTableView) -> Int { MainActor.assumeIsolated { items.count } }
        func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
            guard items.indices.contains(row) else { return nil }
            let cell = tableView.makeView(withIdentifier: .init("media-cell"), owner: nil) as? MediaCell ?? MediaCell()
            cell.identifier = .init("media-cell")
            cell.show(items[row], workspace: parent.session.workspace, theme: parent.theme)
            return cell
        }
        func tableViewSelectionDidChange(_ notification: Notification) {
            guard !updating, let table else { return }
            parent.session.selection = Set(table.selectedRowIndexes.compactMap { items.indices.contains($0) ? items[$0].id : nil })
        }
        nonisolated func tableView(_ tableView: NSTableView, pasteboardWriterForRow row: Int) -> NSPasteboardWriting? {
            MainActor.assumeIsolated {
                guard parent.session.canMoveMedia, items.indices.contains(row) else { return nil }
                if token == nil {
                    let selected = tableView.selectedRowIndexes.contains(row) ? tableView.selectedRowIndexes : IndexSet(integer: row)
                    guard selected.allSatisfy({ items.indices.contains($0) }),
                          let ticket = parent.session.beginMediaMove(Set(selected.map { items[$0].id })) else { return nil }
                    token = ticket
                    StudioUIProof.recordDrag("begin-ticket")
                }
                guard let token, parent.session.acceptsMediaMove(token) else { return nil }
                let writer = NSPasteboardItem()
                writer.setString(token.uuidString, forType: Self.moveType)
                return writer
            }
        }
        private func validToken(_ info: NSDraggingInfo) -> UUID? {
            guard let source = info.draggingSource as? NSTableView, source === table,
                  let value = info.draggingPasteboard.string(forType: Self.moveType),
                  let ticket = UUID(uuidString: value), ticket == token,
                  parent.session.acceptsMediaMove(ticket) else { return nil }
            return ticket
        }
        func tableView(_ tableView: NSTableView, validateDrop info: NSDraggingInfo, proposedRow row: Int, proposedDropOperation operation: NSTableView.DropOperation) -> NSDragOperation {
            StudioUIProof.recordDrag("validate-gap-\(row)")
            if info.draggingPasteboard.types?.contains(Self.moveType) == true {
                guard validToken(info) != nil, (0...items.count).contains(row) else {
                    StudioUIProof.recordDrag("reject-validation"); return []
                }
                tableView.setDropRow(row, dropOperation: .above)
                return .move
            }
            guard !parent.session.importing, info.draggingPasteboard.types?.contains(.fileURL) == true else { return [] }
            // Finder import stays append-only; never imply insertion at the hovered row.
            tableView.setDropRow(-1, dropOperation: .on)
            return .copy
        }
        func tableView(_ tableView: NSTableView, acceptDrop info: NSDraggingInfo, row: Int, dropOperation: NSTableView.DropOperation) -> Bool {
            if info.draggingPasteboard.types?.contains(Self.moveType) == true {
                guard let ticket = validToken(info), (0...items.count).contains(row) else { return false }
                let accepted = parent.session.finishMediaMove(ticket, atGap: row)
                StudioUIProof.recordDrag(accepted ? "commit-ticket" : "reject-ticket")
                if accepted {
                    refresh()
                    if let first = tableView.selectedRowIndexes.first { tableView.scrollRowToVisible(first) }
                }
                return accepted
            }
            let providers = (info.draggingPasteboard.pasteboardItems ?? []).compactMap { item -> NSItemProvider? in
                guard let data = item.data(forType: .fileURL) else { return nil }
                return NSItemProvider(item: data as NSData, typeIdentifier: UTType.fileURL.identifier)
            }
            return !providers.isEmpty && parent.importProviders(providers)
        }
        func tableView(_ tableView: NSTableView, draggingSession session: NSDraggingSession, endedAt screenPoint: NSPoint, operation: NSDragOperation) {
            parent.session.cancelMediaMove()
            token = nil
            tableView.setDropRow(-1, dropOperation: .above)
            StudioUIProof.recordDrag(operation == .move ? "end-move" : "end-cancel")
        }
        func menu(row: Int) -> NSMenu? {
            guard items.indices.contains(row) else { return nil }
            let item = items[row], session = parent.session, playback = parent.playback
            let targets: Set<String> = session.selection.contains(item.id) ? session.selection : [item.id]
            let menu = NSMenu()
            menu.autoenablesItems = false
            func add(_ title: String, enabled: Bool = true, _ action: @escaping () -> Void) {
                let entry = MediaMenuItem(title, action: action); entry.isEnabled = enabled; menu.addItem(entry)
            }
            add("Move Earlier", enabled: session.canMoveMedia) { session.moveItems(targets, by: -1) }
            add("Move Later", enabled: session.canMoveMedia) { session.moveItems(targets, by: 1) }
            menu.addItem(.separator())
            add("Use as opening") { session.markOpening(item.id) }
            add("Use as closing") { session.markClosing(item.id) }
            add(item.spotlight?.enabled == true ? "Remove spotlight" : "Spotlight in centre") {
                session.editItems([item.id], name: "Change spotlight") {
                    var setting = $0.spotlight ?? Spotlight(); setting.enabled = !($0.spotlight?.enabled ?? false); $0.spotlight = setting
                }
            }
            if let cue = session.snapshot.plan.spotlights.first(where: { $0.itemID == item.id }) {
                add("Preview spotlight") { playback.preview(cue, cycle: playback.frame/session.snapshot.plan.schedule.cycleFrames) }
            }
            add("Edit framing…") { session.framingMediaID = item.id }
            if item.kind != .image { add("Preview clip…") { session.previewMediaID = item.id } }
            add(item.included ? "Exclude" : "Include") { session.editItems([item.id], name: "Change inclusion") { $0.included.toggle() } }
            let replace = parent.replaceMedia
            add("Replace…") { session.selection = [item.id]; replace() }
            menu.addItem(.separator())
            add("Duplicate") { session.selection = [item.id]; session.duplicateSelection() }
            add("Remove") { session.selection = [item.id]; session.removeSelection() }
            return menu
        }
    }
}

@MainActor final class MediaTable: NSTableView {
    weak var owner: MediaRail.Coordinator?
    override func menu(for event: NSEvent) -> NSMenu? { owner?.menu(row: row(at: convert(event.locationInWindow, from: nil))) }
    override func keyDown(with event: NSEvent) {
        if event.keyCode == 51 || event.keyCode == 117 { owner?.parent.session.removeSelection() }
        else { super.keyDown(with: event) }
    }
}

/// Labels and thumbnails belong to SwiftUI; selection and pointer tracking belong to the table.
@MainActor private final class MediaCell: NSTableCellView {
    private var hosting: NSHostingView<AnyView>?
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    func show(_ item: MediaItem, workspace: Workspace, theme: StudioTheme) {
        let content = AnyView(MediaRow(item: item, workspace: workspace).environment(\.studioTheme, theme).padding(.horizontal, 8))
        if let hosting { hosting.rootView = content }
        else {
            let view = NSHostingView(rootView: content)
            view.translatesAutoresizingMaskIntoConstraints = false
            addSubview(view)
            NSLayoutConstraint.activate([view.leadingAnchor.constraint(equalTo: leadingAnchor), view.trailingAnchor.constraint(equalTo: trailingAnchor), view.topAnchor.constraint(equalTo: topAnchor), view.bottomAnchor.constraint(equalTo: bottomAnchor)])
            hosting = view
        }
    }
}

@MainActor private final class MediaMenuItem: NSMenuItem {
    let handler: () -> Void
    init(_ title: String, action: @escaping () -> Void) {
        handler = action
        super.init(title: title, action: #selector(invoke), keyEquivalent: "")
        target = self
    }
    required init(coder: NSCoder) { fatalError("Not used") }
    @objc private func invoke() { handler() }
}
