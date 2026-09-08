import XCTest
import AppKit
@testable import GalileoCore
@testable import GalileoNative

@MainActor final class SourceEditingTests:XCTestCase {
    private func session()throws->EditorSession {
        var project=GalleryProject()
        var item=MediaItem(name:"Clip",asset:"clip.mov",sha256:String(repeating:"a",count:64),kind:.video,width:320,height:180,duration:3)
        item.id="clip";item.trimStart=0.25;item.trimEnd=2.5;item.sourceRate=1.5;item.sourceLoops=false
        let still=MediaItem(name:"Image",asset:"image.png",sha256:String(repeating:"b",count:64),kind:.image,width:320,height:180)
        project.items=[item,still]
        let session=try EditorSession(project:project)
        session.undoManager=UndoManager();session.undoManager?.groupsByEvent=false
        return session
    }
    func testLastDefaultAndRememberedChoiceAreOneUndoableEdit() throws {
        let s=try session(),original=s.project
        s.setSourceDisplay(["clip"],plays:false)
        XCTAssertEqual(s.project.items[0].stillFrameSelection,.last);XCTAssertFalse(s.project.items[0].sourcePlays)
        XCTAssertEqual(s.project.items[0].trimStart,0.25);XCTAssertEqual(s.project.items[0].trimEnd,2.5)
        XCTAssertEqual(s.project.items[0].sourceRate,1.5);XCTAssertFalse(s.project.items[0].sourceLoops)
        XCTAssertEqual(s.project.items[1],original.items[1])
        s.undoManager?.undo();XCTAssertEqual(s.project,original)
        s.undoManager?.redo();s.setRelativeStill(["clip"],selection:.first)
        s.setSourceDisplay(["clip"],plays:true);s.setSourceDisplay(["clip"],plays:false)
        XCTAssertEqual(s.project.items[0].stillFrameSelection,.first)
        let revision=s.revision;s.setRelativeStill(["clip"],selection:.first);XCTAssertEqual(s.revision,revision)
    }
    func testChangedThenUndoneSourceCannotReviveOpenDraft() throws {
        let s=try session(),ticket=try XCTUnwrap(s.beginSourceEdit(["clip"]))
        s.setSourceDisplay(["clip"],plays:false);s.undoManager?.undo()
        XCTAssertTrue(s.project.items[0].sourcePlays)
        XCTAssertFalse(s.acceptsSourceEdit(ticket))
        XCTAssertFalse(s.commitSourceDrafts([s.project.items[0]],ticket:ticket))
    }
    func testDraftMergesCaptionAndFramingButRejectsNewerOperationOrReload() throws {
        let s=try session(),ticket=try XCTUnwrap(s.beginSourceEdit(["clip"]))
        var draft=s.project.items[0];draft.trimStart=0.5
        s.editItems(["clip"],name:"Caption and framing") {$0.caption="Keep this";$0.focal.x=0.7}
        XCTAssertTrue(s.commitSourceDrafts([draft],ticket:ticket))
        XCTAssertEqual(s.project.items[0].caption,"Keep this");XCTAssertEqual(s.project.items[0].focal.x,0.7)
        XCTAssertEqual(s.project.items[0].trimStart,0.5)
        s.undoManager?.undo();XCTAssertEqual(s.project.items[0].trimStart,0.25);XCTAssertEqual(s.project.items[0].caption,"Keep this")
        let earlier=try XCTUnwrap(s.beginSourceEdit(["clip"])),newer=try XCTUnwrap(s.beginSourceEdit(["clip"]))
        XCTAssertFalse(s.acceptsSourceEdit(earlier));XCTAssertTrue(s.acceptsSourceEdit(newer))
        let other=try EditorSession(project:s.project);XCTAssertFalse(other.acceptsSourceEdit(newer))
        try s.load(project:s.project,workspace:s.workspace);XCTAssertFalse(s.acceptsSourceEdit(newer))
    }
    func testClosingAndCancelRetireSourceTicket() throws {
        let s=try session(),ticket=try XCTUnwrap(s.beginSourceEdit(["clip"]))
        s.cancelSourceEdit(ticket);XCTAssertFalse(s.acceptsSourceEdit(ticket))
        let next=try XCTUnwrap(s.beginSourceEdit(["clip"]));s.close();XCTAssertFalse(s.acceptsSourceEdit(next))
    }
}
