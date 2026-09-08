import AppKit
import Foundation
import GalileoCore
import GalileoNative

/// A synthetic, externally driven acceptance journey. It never drives its own buttons
/// or substitutes session.move for the mouse gesture under test.
@MainActor enum StudioUIProof {
    private static var dragEvents: [String] = []
    private static var recordingDrag = false
    static func recordDrag(_ event: String) {
        if recordingDrag && dragEvents.count < 100 { dragEvents.append(event) }
    }
    static func run(directory: URL, documents: GalleryDocumentController) async throws {
        let fm = FileManager.default
        try fm.createDirectory(at: directory, withIntermediateDirectories: true)
        guard try fm.contentsOfDirectory(atPath: directory.path).isEmpty else {
            throw GalleryError.invalid("The UI proof requires a new empty evidence directory.")
        }
        let source = (try? JSONSerialization.jsonObject(with: Data(contentsOf: Bundle.main.resourceURL!.appendingPathComponent("build.json"))) as? [String: Any])?["sourceSha"] as? String ?? "unknown"
        var outcomes: [String] = []
        dragEvents = []; recordingDrag = true
        defer { recordingDrag = false }
        do {
            let (project, workspace) = try VerificationFixtures.workspace()
            let document = try GalleryDocument(project: project, workspace: workspace)
            documents.addDocument(document); document.makeWindowControllers(); document.showWindows()
            guard let session = document.editor, let playback = document.playback, let window = document.windowForSheet else {
                throw GalleryError.invalid("The native UI proof window did not open.")
            }
            session.showSidebar = true; session.showInspector = true
            window.title = "Galileo UI proof"; window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            let original = session.project
            let order = original.items.map(\.id)
            let moved = [order[2], order[0], order[1]]
            session.selection = [order[2]]
            try step("drag", directory: directory, values: ["source": original.items[2].name, "target": original.items[0].name])
            try await wait("Mouse drag must reorder the real media list") { session.project.items.map(\.id) == moved }
            guard session.selection == [order[2]] else { throw GalleryError.invalid("Dragging lost the selected slide identity.") }
            guard dragEvents.contains("begin-ticket"), dragEvents.contains("commit-ticket") else {
                throw GalleryError.invalid("The real drag must consume its drag-start ticket.")
            }
            outcomes.append("mouse-drag")
            try step("undo", directory: directory)
            try await wait("Keyboard Undo must restore one media move") { session.project == original }
            guard !document.isDocumentEdited else { throw GalleryError.invalid("One drag created extra document edits.") }
            outcomes.append("single-keyboard-undo")
            try step("redo", directory: directory)
            try await wait("Keyboard Redo must restore the move") { session.project.items.map(\.id) == moved }
            try step("undo-menu", directory: directory)
            try await wait("Menu Undo must restore the move") { session.project == original }
            outcomes.append("redo-and-menu-undo")

            try step("search", directory: directory)
            try await wait("Search must be entered through the real field") { session.mediaQuery == "Field" }
            guard !session.canMoveMedia else { throw GalleryError.invalid("Filtered movement is not disabled.") }
            try step("clear-search", directory: directory)
            try await wait("The clear-search control must restore the full list") { session.mediaQuery.isEmpty }
            guard session.project == original else { throw GalleryError.invalid("Search altered document content.") }
            outcomes.append("filtered-state-and-clear")

            try step("canvas-menu", directory: directory)
            try await wait("Styled canvas menu must select the actual value") { session.project.canvas.width == 2576 && session.project.canvas.height == 1080 }
            try step("undo-canvas", directory: directory)
            try await wait("Canvas menu change must remain undoable") { session.project == original }
            outcomes.append("styled-native-menu")

            try step("numeric-field", directory: directory)
            try await wait("Styled numeric field must accept keyboard entry") { session.project.canvas.width == 2048 }
            // The driver moves focus by selecting an inspector tab, not a hidden command.
            let beforeInspectorCheck = playback.frame
            try step("media-tab", directory: directory)
            try await wait("Driver must finish the visible inspector check and actual frame step") {
                playback.frame != beforeInspectorCheck
            }
            guard session.issue==nil else {throw GalleryError.invalid("Valid numeric entry published a spurious validation error: \(session.issue!)")}
            try step("undo-width",directory:directory)
            try await wait("One Undo must reverse one completed canvas width edit") {session.project==original}
            try step("redo-width",directory:directory)
            try await wait("Redo must restore the completed canvas width") {session.project.canvas.width==2048}
            outcomes.append("styled-field-and-inspector-tabs")

            let beforeAppearance = session.project
            for (name, appearance) in [("light", NSAppearance.Name.aqua), ("dark", .darkAqua)] {
                NSApp.appearance = NSAppearance(named: appearance)
                window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
                let frame = playback.frame
                try step("capture-" + name, directory: directory)
                try await wait("Capture must finish through an actual frame-step button") { playback.frame != frame }
                guard session.project == beforeAppearance else { throw GalleryError.invalid("Interface appearance changed the artwork state.") }
                outcomes.append("active-" + name + "-capture")
            }
            var video=try await VerificationFixtures.loopingVideo(workspace:session.workspace)
            video.trimStart=0.25;video.trimEnd=2.5;video.sourceRate=1.5;video.sourceLoops=false
            session.commit("Add source acceptance fixture") {$0.items.append(video)}
            session.selection=[video.id]
            func selectedSource()->MediaItem? {session.project.items.first{$0.id==video.id}}
            try step("source-still",directory:directory)
            try await wait("First Still action must choose Last") {selectedSource()?.sourcePlays==false && selectedSource()?.stillFrameSelection == .last}
            try step("source-undo",directory:directory)
            try await wait("One Undo must restore moving source and absent choice") {selectedSource()==video}
            try step("source-redo",directory:directory)
            try await wait("One Redo must restore Last") {selectedSource()?.sourcePlays==false && selectedSource()?.stillFrameSelection == .last}
            try step("source-first",directory:directory)
            try await wait("The visible First choice must author First") {selectedSource()?.stillFrameSelection == .first}
            try step("source-moving",directory:directory)
            try await wait("Video must retain the remembered frame") {selectedSource()?.sourcePlays==true && selectedSource()?.stillFrameSelection == .first}
            try step("source-still-again",directory:directory)
            try await wait("Returning to Still must retain First") {selectedSource()?.sourcePlays==false && selectedSource()?.stillFrameSelection == .first}
            try step("source-middle",directory:directory)
            try await wait("The visible Middle choice must author Middle") {selectedSource()?.stillFrameSelection == .middle}
            try step("source-custom",directory:directory)
            try await wait("Use this frame and Apply must commit an independent Custom anchor") {
                if case .some(.custom(_))=selectedSource()?.stillFrameSelection {return true};return false
            }
            guard let selected=selectedSource(),selected.trimStart==video.trimStart,selected.trimEnd==video.trimEnd,
                  selected.sourceRate==video.sourceRate,selected.sourceLoops==video.sourceLoops else {throw GalleryError.invalid("Frame selection changed the source trim, rate or loop settings.")}
            outcomes.append("source-display-last-default-undo-remembered-choice-custom-apply")
            try JSONSerialization.data(withJSONObject: ["result": "passed", "source": source, "checks": outcomes, "dragEvents": dragEvents], options: [.prettyPrinted, .sortedKeys])
                .write(to: directory.appendingPathComponent("RESULT.json"), options: .atomic)
            document.close()
        } catch {
            try? JSONSerialization.data(withJSONObject: ["result": "failed", "source": source, "completed": outcomes, "dragEvents": dragEvents, "error": error.localizedDescription], options: [.prettyPrinted, .sortedKeys])
                .write(to: directory.appendingPathComponent("RESULT.json"), options: .atomic)
            throw error
        }
    }
    private static func step(_ name: String, directory: URL, values: [String: String] = [:]) throws {
        var values = values; values["step"] = name; values["window"] = "Galileo UI proof"
        try JSONSerialization.data(withJSONObject: values, options: [.sortedKeys])
            .write(to: directory.appendingPathComponent("STEP.json"), options: .atomic)
    }
    private static func wait(_ message: String, _ predicate: () -> Bool) async throws {
        let deadline = ProcessInfo.processInfo.systemUptime + 40
        while !predicate() {
            try Task.checkCancellation()
            guard ProcessInfo.processInfo.systemUptime < deadline else { throw GalleryError.invalid(message) }
            try await Task.sleep(nanoseconds: 30_000_000)
        }
    }
}
