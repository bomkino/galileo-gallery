import XCTest
@testable import GalileoCore

final class StillMigrationTests:XCTestCase {
    func testOlderFrozenIntentKeepsTrimAndLegacySamplingTag() throws {
        var project=GalleryProject()
        var frozen=MediaItem(name:"Clip",asset:"clip.mov",sha256:String(repeating:"a",count:64),kind:.video,width:320,height:180,duration:3)
        frozen.trimStart=0.399999999;frozen.trimEnd=2.5;frozen.sourceRate=1.5;frozen.sourceLoops=false;frozen.sourcePlays=false
        var playing=frozen;playing.id="playing";playing.sourcePlays=true
        project.items=[frozen,playing];project.schemaVersion=7
        let raw=try JSONEncoder().encode(project),loaded=try GalleryProject.decodeWithProvenance(raw)
        XCTAssertEqual(loaded.loadedSchema,7);XCTAssertEqual(loaded.project.schemaVersion,8)
        XCTAssertEqual(loaded.project.items[0].stillFrameSelection,.legacyFrozen(0.399999999))
        XCTAssertNil(loaded.project.items[1].stillFrameSelection)
        XCTAssertEqual(loaded.project.items[0].trimStart,frozen.trimStart)
        XCTAssertEqual(loaded.project.items[0].trimEnd,frozen.trimEnd)
        XCTAssertEqual(loaded.project.items[0].sourceRate,1.5);XCTAssertFalse(loaded.project.items[0].sourceLoops)
        XCTAssertEqual(try GalleryProject.decode(loaded.project.encoded()),loaded.project)
    }
    func testCurrentSchemaRejectsMissingFrozenChoiceAndImageChoice() throws {
        var project=GalleryProject()
        var item=MediaItem(name:"Clip",asset:"clip.mov",sha256:String(repeating:"b",count:64),kind:.video,width:320,height:180,duration:3)
        item.sourcePlays=false;project.items=[item]
        XCTAssertThrowsError(try GalleryProject.decode(JSONEncoder().encode(project)))
        project.items[0].stillFrameSelection = .last;XCTAssertNoThrow(try project.validate())
        project.items[0].kind = .image;XCTAssertThrowsError(try project.validate())
        project.items[0].kind = .video;project.items[0].stillFrameSelection = .custom(try SourceTime(value:3,timescale:1))
        XCTAssertThrowsError(try project.validate(),"Exclusive source end cannot be a Custom anchor")
        project.items[0].stillFrameSelection = .middle;project.schemaVersion=9
        XCTAssertThrowsError(try GalleryProject.decode(JSONEncoder().encode(project)))
    }
}
