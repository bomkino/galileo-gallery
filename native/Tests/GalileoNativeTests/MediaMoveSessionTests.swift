import XCTest
import AppKit
@testable import GalileoCore
@testable import GalileoNative

final class MediaMoveSessionTests: XCTestCase {
    @MainActor private func session() throws -> EditorSession {
        var p=GalleryProject()
        p.items=(0..<5).map { i in
            var item=MediaItem(name:"same.png",asset:"sample-\(i).png",sha256:String(repeating:"a",count:64),kind:.image,width:20,height:20)
            item.id=String(i); item.caption="caption-\(i)"; return item
        }
        p.items[1].opening=true; p.items[3].closing=true; p.items[3].spotlight=Spotlight()
        let session=try EditorSession(project:p)
        session.undoManager=UndoManager();session.undoManager?.groupsByEvent=false
        return session
    }
    @MainActor func testOpaqueTicketPreservesNewCaptionsAndOneUndo() throws {
        let s=try session(); s.selection=["1","3"]
        let token=try XCTUnwrap(s.beginMediaMove(s.selection))
        s.editItems(["1"],name:"Caption") { $0.caption="new caption" }
        XCTAssertTrue(s.acceptsMediaMove(token))
        XCTAssertTrue(s.finishMediaMove(token,atGap:5))
        XCTAssertEqual(s.project.items.map(\.id),["0","2","4","1","3"])
        XCTAssertEqual(s.project.items[3].caption,"new caption")
        XCTAssertTrue(s.project.items[3].opening)
        XCTAssertEqual(s.project.items[4].closing,true)
        XCTAssertEqual(s.selection,["1","3"])
        s.undoManager?.undo()
        XCTAssertEqual(s.project.items.map(\.id),["0","1","2","3","4"])
        XCTAssertEqual(s.project.items[1].caption,"new caption")
        s.undoManager?.redo()
        XCTAssertEqual(s.project.items.map(\.id),["0","2","4","1","3"])
    }
    @MainActor func testChangedThenUndoneOrderCannotReviveTicket() throws {
        let s=try session();let token=try XCTUnwrap(s.beginMediaMove(["1"]))
        s.moveItems(["2"],by:1);s.undoManager?.undo()
        XCTAssertEqual(s.project.items.map(\.id),["0","1","2","3","4"])
        XCTAssertFalse(s.acceptsMediaMove(token));XCTAssertFalse(s.finishMediaMove(token,atGap:5))
    }
    @MainActor func testForeignSessionSearchCancelAndNoOp() throws {
        let a=try session(),b=try EditorSession(project:a.project)
        let token=try XCTUnwrap(a.beginMediaMove(["1","2"]))
        XCTAssertFalse(b.acceptsMediaMove(token))
        let revision=a.revision
        XCTAssertTrue(a.finishMediaMove(token,atGap:2))
        XCTAssertEqual(a.revision,revision);XCTAssertFalse(a.undoManager?.canUndo ?? true)
        let searchToken=try XCTUnwrap(a.beginMediaMove(["1"]))
        a.mediaQuery="same";a.moveItems(["1"],by:1);a.mediaQuery=""
        XCTAssertFalse(a.acceptsMediaMove(searchToken));XCTAssertEqual(a.revision,revision)
        let cancelled=try XCTUnwrap(a.beginMediaMove(["1"]));a.cancelMediaMove()
        XCTAssertFalse(a.acceptsMediaMove(cancelled))
    }
    @MainActor func testInvalidOffsetAtomicAndClosedOrReplacedSessionRejects() throws {
        let s=try session();let before=s.project
        s.move(from:IndexSet([1,999]),to:2)
        XCTAssertEqual(s.project,before);XCTAssertFalse(s.undoManager?.canUndo ?? true)
        let token=try XCTUnwrap(s.beginMediaMove(["1"]))
        s.editItems(["0"],name:"Replace") { $0.sha256=String(repeating:"b",count:64) }
        XCTAssertFalse(s.acceptsMediaMove(token))
        let closing=try XCTUnwrap(s.beginMediaMove(["1"]));s.close()
        XCTAssertFalse(s.acceptsMediaMove(closing))
    }
}
