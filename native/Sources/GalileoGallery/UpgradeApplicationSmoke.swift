import AppKit
import GalileoCore
import GalileoNative

/// Runs against disposable packages through NSDocument's real save/autosave boundary.
@MainActor enum UpgradeApplicationSmoke {
    static func run(directory:URL,documents:GalleryDocumentController) async throws ->[String:Any] {
        let fm=FileManager.default,root=directory.appendingPathComponent("upgrade-copy",isDirectory:true)
        try fm.createDirectory(at:root,withIntermediateDirectories:true)
        let (project,workspace)=try VerificationFixtures.workspace()
        let original=root.appendingPathComponent("Original.galileo",isDirectory:true)
        try NativeDocumentIO.writePackage(project:project,workspace:workspace,to:original)
        let manifest=original.appendingPathComponent("project.json")
        var old=try JSONSerialization.jsonObject(with:Data(contentsOf:manifest)) as! [String:Any]
        old["schemaVersion"]=6
        try JSONSerialization.data(withJSONObject:old,options:.sortedKeys).write(to:manifest)
        let originalHashes=try hashes(original)
        let copy:GalleryDocument=try await withCheckedThrowingContinuation { continuation in
            documents.openDocument(withContentsOf:original,display:false) { doc,_,error in
                if let error {continuation.resume(throwing:error)}
                else if let doc=doc as? GalleryDocument {continuation.resume(returning:doc)}
                else {continuation.resume(throwing:GalleryError.invalid("Upgrade did not open a native copy."))}
            }
        }
        defer {copy.close()}
        guard copy.fileURL == nil,copy.isDocumentEdited,copy.upgradeProtection != nil else {throw GalleryError.invalid("An older file was not opened as a protected untitled copy.")}
        var duplicate:NSDocument?
        documents.openDocument(withContentsOf:original,display:false) {document,_,_ in duplicate=document}
        guard duplicate === copy else {throw GalleryError.invalid("Duplicate opening lost the upgrade session.")}
        copy.makeWindowControllers()
        guard let editor=copy.editor,editor.project.id != project.id,editor.project.items == project.items else {throw GalleryError.invalid("Upgrade identity changed source content.")}
        let renderer=NativeRenderer()
        let before=try renderer.image(snapshot:RenderSnapshot(project:project,workspace:workspace),frame:7,maximumDimension:160)
        let after=try renderer.image(snapshot:editor.snapshot,frame:7,maximumDimension:160)
        guard before.dataProvider?.data == after.dataProvider?.data else {throw GalleryError.invalid("Upgrade document identity changed rendered pixels.")}
        editor.commit("Upgrade draft edit") {$0.name="Draft survives"}
        try await withCheckedThrowingContinuation { (c:CheckedContinuation<Void,Error>) in
            copy.autosave(withImplicitCancellability:false) {error in if let error {c.resume(throwing:error)} else {c.resume()}}
        }
        guard let draft=copy.autosavedContentsFileURL else {throw GalleryError.invalid("The upgrade copy did not produce a native recovery draft.")}
        let restored=try documents.makeDocument(for:nil,withContentsOf:draft,ofType:GalleryDocument.typeName) as! GalleryDocument
        defer {restored.close()}
        guard restored.fileURL == nil,restored.upgradeProtection?.protects(original)==true else {throw GalleryError.invalid("Native draft restoration lost original-file protection.")}
        restored.makeWindowControllers()
        guard restored.editor?.project==editor.project else {throw GalleryError.invalid("The restored upgrade draft lost authored content.")}
        let alias=root.appendingPathComponent("Alias.galileo")
        try fm.createSymbolicLink(at:alias,withDestinationURL:original)
        for destination in [original,alias] {
            do {try copy.writeSafely(to:destination,ofType:GalleryDocument.typeName,for:.saveAsOperation);throw GalleryError.invalid("protected-destination-accepted")}
            catch GalleryError.invalid(let text) where text == "protected-destination-accepted" {throw GalleryError.invalid(text)}
            catch {}
        }
        let saved=root.appendingPathComponent("Upgraded.galileo",isDirectory:true)
        try await save(copy,to:saved)
        guard copy.fileURL == saved,!copy.isDocumentEdited,try NativeDocumentIO.readPackage(saved).0==editor.project,
              !fm.fileExists(atPath:saved.appendingPathComponent(UpgradeProtection.draftFilename).path) else {throw GalleryError.invalid("First Save failed or leaked local provenance into the saved package.")}
        editor.commit("Saved upgrade edit") {$0.name="Saved upgrade"}
        try await withCheckedThrowingContinuation { (c:CheckedContinuation<Void,Error>) in
            copy.autosave(withImplicitCancellability:false) {error in if let error {c.resume(throwing:error)} else {c.resume()}}
        }
        guard try NativeDocumentIO.readPackage(saved).0==editor.project else {throw GalleryError.invalid("Upgraded copy did not autosave at its new destination.")}
        let moved=root.appendingPathComponent("Renamed original.galileo")
        try fm.moveItem(at:original,to:moved)
        guard copy.upgradeProtection?.protects(moved)==true,restored.upgradeProtection?.protects(moved)==true else {throw GalleryError.invalid("Renaming the original bypassed upgrade protection.")}
        let blocked=root.appendingPathComponent("not-a-folder")
        try Data("blocked".utf8).write(to:blocked)
        editor.commit("Unsaved after failure") {$0.name="Keep this edit"}
        do {try await save(copy,to:blocked.appendingPathComponent("Failed.galileo"));throw GalleryError.invalid("blocked-save-accepted")}
        catch GalleryError.invalid(let text) where text == "blocked-save-accepted" {throw GalleryError.invalid(text)}
        catch {}
        guard copy.isDocumentEdited,try hashes(moved)==originalHashes else {throw GalleryError.invalid("Upgrade save or failure modified the older original.")}
        return ["olderOriginalHashesPreserved":true,"upgradeCopyIdentityPixels":true,"nativeUpgradeDraftRestoration":true,
                "upgradeAliasAndRenamedOriginalDenied":true,"upgradeFirstSaveAndAutosave":true,"upgradeFailedSavePreservesEdits":true]
    }
    private static func save(_ document:GalleryDocument,to url:URL) async throws {
        try await withCheckedThrowingContinuation { (c:CheckedContinuation<Void,Error>) in
            document.save(to:url,ofType:GalleryDocument.typeName,for:.saveAsOperation) {error in if let error {c.resume(throwing:error)} else {c.resume()}}
        }
    }
    private static func hashes(_ root:URL)throws->[String:String] {
        guard let entries=FileManager.default.enumerator(at:root,includingPropertiesForKeys:[.isRegularFileKey]) else {throw GalleryError.invalid("Missing upgrade fixture.")}
        var result=[String:String]()
        for case let file as URL in entries where try file.resourceValues(forKeys:[.isRegularFileKey]).isRegularFile == true {
            result[String(file.path.dropFirst(root.path.count))]=try Workspace.fingerprint(file)
        }
        return result
    }
}
