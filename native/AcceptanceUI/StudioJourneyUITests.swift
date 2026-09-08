import XCTest
import Foundation

final class StudioJourneyUITests: XCTestCase {
    private func json(_ url: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
    @MainActor func testActualStudioControlsAndDrag() throws {
        continueAfterFailure = false
        let bundle = Bundle(for: Self.self)
        let path = try XCTUnwrap(bundle.object(forInfoDictionaryKey: "ApplicationPath") as? String)
        let root = URL(fileURLWithPath: try XCTUnwrap(bundle.object(forInfoDictionaryKey: "ProofPath") as? String))
        let source = try XCTUnwrap(bundle.object(forInfoDictionaryKey: "SourceRevision") as? String)
        let app = XCUIApplication(url: URL(fileURLWithPath: path))
        app.launchArguments = ["--studio-ui-proof", root.path, "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        defer { if app.state != .notRunning { app.terminate() } }
        do {
            for name in ["drag", "undo", "redo", "undo-menu", "search", "clear-search", "canvas-menu", "undo-canvas", "numeric-field", "media-tab", "capture-light", "capture-dark"] {
                let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                    self.json(root.appendingPathComponent("STEP.json"))?["step"] as? String == name ||
                    self.json(root.appendingPathComponent("RESULT.json")) != nil || app.state == .notRunning
                }, object: nil)
                XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 45), .completed, "Missing proof step \(name)")
                XCTAssertNil(json(root.appendingPathComponent("RESULT.json")), "Application failed: \(String(describing: json(root.appendingPathComponent("RESULT.json"))))")
                let step = try XCTUnwrap(json(root.appendingPathComponent("STEP.json")))
                let window = app.windows["Galileo UI proof"]
                XCTAssertTrue(window.waitForExistence(timeout: 10))
                switch name {
                case "drag":
                    let media = window.descendants(matching: .any).matching(identifier: "galileo.media-list").firstMatch
                    XCTAssertTrue(media.waitForExistence(timeout: 5))
                    let row = media.staticTexts[try XCTUnwrap(step["source"] as? String)].firstMatch
                    let target = media.staticTexts[try XCTUnwrap(step["target"] as? String)].firstMatch
                    if !row.isHittable || !target.isHittable {
                        let tree = XCTAttachment(string: app.debugDescription)
                        tree.name = "Media row hit-testing"; tree.lifetime = .keepAlways; add(tree)
                    }
                    XCTAssertTrue(row.isHittable); XCTAssertTrue(target.isHittable)
                    row.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 1,
                        thenDragTo: target.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0)).withOffset(CGVector(dx: 0, dy: -5)))
                case "undo", "undo-canvas": app.typeKey("z", modifierFlags: .command)
                case "redo": app.typeKey("z", modifierFlags: [.command, .shift])
                case "undo-menu":
                    app.menuBars.menuBarItems["Edit"].click()
                    let undo = app.menuItems["galileo.edit.undo"]
                    XCTAssertTrue(undo.isEnabled); undo.click()
                case "search":
                    let field = window.textFields["Find media"]; XCTAssertTrue(field.isHittable); field.click(); field.typeText("Field")
                case "clear-search":
                    app.menuBars.menuBarItems["Edit"].click()
                    XCTAssertFalse(app.menuItems["Move Earlier"].isEnabled); XCTAssertFalse(app.menuItems["Move Later"].isEnabled)
                    app.typeKey(.escape, modifierFlags: [])
                    window.buttons["Clear search to reorder"].click()
                case "canvas-menu":
                    let trigger = window.descendants(matching: .any).matching(identifier: "galileo.canvas-size").firstMatch
                    XCTAssertTrue(trigger.isHittable); trigger.click()
                    let choice = app.menuItems["2576 × 1080"]; XCTAssertTrue(choice.waitForExistence(timeout: 4)); choice.click()
                case "numeric-field":
                    let field = window.textFields["Canvas width"]; XCTAssertTrue(field.isHittable); field.click()
                    field.typeKey("a", modifierFlags: .command); field.typeText("2048"); field.typeKey(.return, modifierFlags: [])
                case "media-tab":
                    let tabs = window.descendants(matching: .any).matching(identifier: "galileo.inspector-tabs").firstMatch
                    let choice = tabs.buttons["Media"]; XCTAssertTrue(choice.isHittable); choice.click()
                    XCTAssertTrue(window.buttons["Edit framing…"].waitForExistence(timeout: 4))
                    let next = window.buttons["Next frame"]; XCTAssertTrue(next.isHittable); next.click()
                case "capture-light", "capture-dark":
                    let shot = window.screenshot()
                    let attachment = XCTAttachment(screenshot: shot); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
                    let next = window.buttons["Next frame"]; XCTAssertTrue(next.isHittable); next.click()
                default: XCTFail("Unrecognised proof step")
                }
            }
            let finished = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in self.json(root.appendingPathComponent("RESULT.json")) != nil }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [finished], timeout: 45), .completed)
            let result = try XCTUnwrap(json(root.appendingPathComponent("RESULT.json")))
            XCTAssertEqual(result["result"] as? String, "passed", "\(result)")
            XCTAssertEqual(result["source"] as? String, source)
        } catch {
            let tree = XCTAttachment(string: app.debugDescription); tree.name = "Actual studio accessibility tree"; tree.lifetime = .keepAlways; add(tree)
            if app.state != .notRunning {
                let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "Studio failure"; shot.lifetime = .keepAlways; add(shot)
            }
            throw error
        }
    }
}
