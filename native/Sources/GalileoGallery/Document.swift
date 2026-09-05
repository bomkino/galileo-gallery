import AppKit
import SwiftUI
import UniformTypeIdentifiers
import GalileoCore
import GalileoNative

extension Notification.Name {
    static let showExports=Notification.Name("dog.pitch.galileo.exports")
    static let togglePlayback=Notification.Name("dog.pitch.galileo.playback")
    static let stepBackward=Notification.Name("dog.pitch.galileo.previous-frame")
    static let stepForward=Notification.Name("dog.pitch.galileo.next-frame")
}
private final class DocumentStorage:@unchecked Sendable {
    private let lock=NSLock()
    private var snapshot:RenderSnapshot?
    func get()throws->RenderSnapshot { lock.lock();defer{lock.unlock()};guard let snapshot else {throw GalleryError.invalid("The document is not ready.")};return snapshot }
    func set(_ value:RenderSnapshot) { lock.lock();snapshot=value;lock.unlock() }
}
@objc(GalileoDocument) @MainActor final class GalleryDocument:NSDocument {
    static let typeName="dog.pitch.galileo.document"
    nonisolated private let storage=DocumentStorage()
    private(set) var editor:EditorSession?
    private(set) var playback:PlaybackModel?
    override init() {
        super.init();hasUndoManager=true
        // Install the document-owned manager explicitly before binding the editor.
        undoManager=UndoManager()
        if let workspace=try? Workspace(),let snapshot=try? RenderSnapshot(project:GalleryProject(),workspace:workspace) { storage.set(snapshot) }
        fileType=Self.typeName
    }
    convenience init(project:GalleryProject,workspace:Workspace)throws { self.init();storage.set(try RenderSnapshot(project:project,workspace:workspace)) }
    nonisolated override class var autosavesInPlace:Bool { true }
    nonisolated override class func canConcurrentlyReadDocuments(ofType typeName:String)->Bool { false }
    nonisolated override func canAsynchronouslyWrite(to url:URL,ofType typeName:String,for saveOperation:NSDocument.SaveOperationType)->Bool { true }
    nonisolated override func read(from url:URL,ofType typeName:String)throws {
        let (project,workspace)=try NativeDocumentIO.readPackage(url)
        storage.set(try RenderSnapshot(project:project,workspace:workspace))
        let adopt: @MainActor () throws -> Void = { [self] in
            try editor?.load(project:project,workspace:workspace)
            editor?.documentName=url.deletingPathExtension().lastPathComponent
            if let editor { playback?.update(editor.snapshot.plan) }
        }
        if Thread.isMainThread { try MainActor.assumeIsolated(adopt) }
        else { try DispatchQueue.main.sync { try MainActor.assumeIsolated(adopt) } }
    }
    nonisolated override func write(to url:URL,ofType typeName:String)throws {
        let snapshot=try storage.get()
        if !Thread.isMainThread { unblockUserInteraction() }
        try NativeDocumentIO.writePackage(project:snapshot.plan.project,workspace:snapshot.workspace,to:url)
    }
    nonisolated override func fileWrapper(ofType typeName:String)throws->FileWrapper {
        let snapshot=try storage.get();return try NativeDocumentIO.wrapper(project:snapshot.plan.project,workspace:snapshot.workspace)
    }
    override var fileURL:URL? {
        didSet {
            let newURL=fileURL
            Task { @MainActor [weak self] in
                guard let self,let newURL,self.fileURL==newURL else { return }
                self.editor?.documentName=newURL.deletingPathExtension().lastPathComponent
            }
        }
    }
    override func makeWindowControllers() {
        do {
            let snapshot=try storage.get(),session=try EditorSession(project:snapshot.plan.project,workspace:snapshot.workspace)
            let playback=PlaybackModel(schedule:snapshot.plan.schedule);playback.update(snapshot.plan)
            self.editor=session;self.playback=playback
            session.undoManager=undoManager;undoManager?.groupsByEvent=false
            session.documentName=fileURL?.deletingPathExtension().lastPathComponent ?? snapshot.plan.project.name
            session.didEdit={ [weak self,weak session] in if let self,let session { self.storage.set(session.snapshot) } }
            let controller=StudioWindowController(document:self,session:session,playback:playback)
            addWindowController(controller)
        } catch { presentError(error) }
    }
    override func close() { playback?.pause();editor?.close();super.close() }
    @objc func addMedia(_ sender:Any?) {
        guard let editor,!editor.importing else { return }
        let panel=NSOpenPanel();panel.title="Add media";panel.allowsMultipleSelection=true;panel.canChooseDirectories=false
        panel.allowedContentTypes=AssetImporter.extensions.compactMap{UTType(filenameExtension:$0)}
        if let window=windowForSheet { panel.beginSheetModal(for:window) { result in if result == .OK { editor.importURLs(panel.urls) } } }
        else if panel.runModal() == .OK { editor.importURLs(panel.urls) }
    }
    @objc func replaceMedia(_ sender:Any?) {
        guard let editor,editor.selection.count==1,let id=editor.selection.first,!editor.importing else{return}
        let panel=NSOpenPanel();panel.title="Replace media";panel.allowsMultipleSelection=false;panel.canChooseDirectories=false
        panel.allowedContentTypes=AssetImporter.extensions.compactMap{UTType(filenameExtension:$0)}
        if let window=windowForSheet { panel.beginSheetModal(for:window) { result in if result == .OK {editor.importURLs(panel.urls,replacing:id)} } }
    }
    @objc func chooseScene(_ sender:Any?) { playback?.pause();editor?.choosingScene=true }
    @objc func exportDocument(_ sender:Any?) { playback?.pause();editor?.choosingExport=true }
    @objc func togglePlayback(_ sender:Any?) { playback?.toggle() }
    @objc func previousFrame(_ sender:Any?) { playback?.step(-1) }
    @objc func nextFrame(_ sender:Any?) { playback?.step(1) }
    @objc func toggleSidebar(_ sender:Any?) { editor?.showSidebar.toggle() }
    @objc func toggleInspector(_ sender:Any?) { editor?.showInspector.toggle() }
    @objc func duplicateMedia(_ sender:Any?) { editor?.duplicateSelection() }
    @objc func removeMedia(_ sender:Any?) { editor?.removeSelection() }
    @objc func moveMediaEarlier(_ sender:Any?) { editor?.moveSelection(by:-1) }
    @objc func moveMediaLater(_ sender:Any?) { editor?.moveSelection(by:1) }
    @objc func saveScenePreset(_ sender:Any?) {
        guard let editor else {return}
        let panel=NSSavePanel();panel.title="Save scene preset";panel.nameFieldStringValue="Scene.galileo-preset";panel.allowedContentTypes=[UTType(filenameExtension:"galileo-preset") ?? .json]
        guard panel.runModal() == .OK,let url=panel.url else{return}
        do {
            let preset=ScenePreset(name:url.deletingPathExtension().lastPathComponent,project:editor.project);try preset.validate()
            let encoder=JSONEncoder();encoder.outputFormatting=[.prettyPrinted,.sortedKeys]
            try encoder.encode(preset).write(to:url,options:.atomic)
        } catch {editor.issue=error.localizedDescription}
    }
    @objc func openScenePreset(_ sender:Any?) {
        guard let editor else{return}
        let panel=NSOpenPanel();panel.title="Apply scene preset";panel.allowedContentTypes=[UTType(filenameExtension:"galileo-preset") ?? .json,.json]
        guard panel.runModal() == .OK,let url=panel.url else{return}
        do {
            let size=try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? Int.max
            guard size<=1024*1024 else{throw GalleryError.invalid("The preset is too large.")}
            let preset=try JSONDecoder().decode(ScenePreset.self,from:Data(contentsOf:url));try preset.validate()
            editor.commit("Apply scene preset"){$0.scene=preset.scene;$0.timing=preset.timing}
        } catch {editor.issue=error.localizedDescription}
    }
    override func validateUserInterfaceItem(_ item:NSValidatedUserInterfaceItem)->Bool {
        let action=item.action
        if action == #selector(exportDocument(_:)) {return !(editor?.project.activeItems.isEmpty ?? true) && !ExportCenter.shared.busy}
        if [#selector(duplicateMedia(_:)),#selector(removeMedia(_:)),#selector(moveMediaEarlier(_:)),#selector(moveMediaLater(_:))].contains(action) {return !(editor?.selection.isEmpty ?? true)}
        if action == #selector(addMedia(_:)) {return !(editor?.importing ?? true)}
        return super.validateUserInterfaceItem(item)
    }
}
@MainActor final class StudioWindowController:NSWindowController,NSToolbarDelegate {
    private weak var galleryDocument:GalleryDocument?
    private var observers:[NSObjectProtocol]=[]
    init(document:GalleryDocument,session:EditorSession,playback:PlaybackModel) {
        let window=NSWindow(contentRect:NSRect(x:0,y:0,width:1280,height:800),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.minSize=NSSize(width:920,height:650);window.title=session.documentName;window.tabbingMode = .preferred
        window.toolbarStyle = .unified;window.isReleasedWhenClosed=false
        window.setFrameAutosaveName("GalileoStudio");window.center()
        super.init(window:window);galleryDocument=document
        let view=StudioView(session:session,playback:playback,addMedia:{[weak document] in document?.addMedia(nil)},replaceMedia:{[weak document] in document?.replaceMedia(nil)})
        window.contentView=NSHostingView(rootView:view)
        let toolbar=NSToolbar(identifier:"GalileoStudioToolbar");toolbar.delegate=self;toolbar.displayMode = .iconAndLabel;toolbar.allowsUserCustomization=false;window.toolbar=toolbar
        for (name,action) in [(Notification.Name.togglePlayback,0),(.stepBackward,1),(.stepForward,2)] {
            observers.append(NotificationCenter.default.addObserver(forName:name,object:window,queue:.main) { [weak playback] _ in MainActor.assumeIsolated { if action==0 {playback?.toggle()} else {playback?.step(action==1 ? -1:1)} } })
        }
    }
    private func projectTitle(_ session:EditorSession)->String {session.documentName}
    required init?(coder:NSCoder) {fatalError("Programmatic window")}
    deinit {observers.forEach{NotificationCenter.default.removeObserver($0)}}
    func toolbarDefaultItemIdentifiers(_ toolbar:NSToolbar)->[NSToolbarItem.Identifier] {[.init("sidebar"),.flexibleSpace,.init("add"),.init("scene"),.init("export"),.init("inspector")]}
    func toolbarAllowedItemIdentifiers(_ toolbar:NSToolbar)->[NSToolbarItem.Identifier] {toolbarDefaultItemIdentifiers(toolbar)}
    func toolbar(_ toolbar:NSToolbar,itemForItemIdentifier id:NSToolbarItem.Identifier,willBeInsertedIntoToolbar:Bool)->NSToolbarItem? {
        let definitions:[String:(String,String,Selector)]=[
            "sidebar":("Media","sidebar.left",#selector(GalleryDocument.toggleSidebar(_:))),
            "add":("Add","plus",#selector(GalleryDocument.addMedia(_:))),
            "scene":("Scene","square.stack.3d.up",#selector(GalleryDocument.chooseScene(_:))),
            "export":("Export","square.and.arrow.up",#selector(GalleryDocument.exportDocument(_:))),
            "inspector":("Inspector","sidebar.right",#selector(GalleryDocument.toggleInspector(_:)))
        ]
        guard let (label,symbol,action)=definitions[id.rawValue] else{return nil}
        let item=NSToolbarItem(itemIdentifier:id);item.label=label;item.paletteLabel=label;item.toolTip=label;item.image=NSImage(systemSymbolName:symbol,accessibilityDescription:label);item.target=galleryDocument;item.action=action;return item
    }
}
@MainActor final class GalleryDocumentController:NSDocumentController {
    private(set) var pendingOpens=0
    override var defaultType:String? {GalleryDocument.typeName}
    override func documentClass(forType typeName:String)->AnyClass? {GalleryDocument.self}
    override func makeUntitledDocument(ofType typeName:String)throws->NSDocument {GalleryDocument()}
    override func makeDocument(withContentsOf url:URL,ofType typeName:String)throws->NSDocument {try GalleryDocument(contentsOf:url,ofType:GalleryDocument.typeName)}
    override func makeDocument(for url:URL?,withContentsOf contentsURL:URL,ofType typeName:String)throws->NSDocument {try GalleryDocument(for:url,withContentsOf:contentsURL,ofType:GalleryDocument.typeName)}
    override func openDocument(withContentsOf url:URL,display:Bool,completionHandler:@escaping (NSDocument?,Bool,Error?)->Void) {
        let isDirectory=(try? url.resourceValues(forKeys:[.isDirectoryKey]).isDirectory)==true
        if isDirectory {super.openDocument(withContentsOf:url,display:display,completionHandler:completionHandler);return}
        pendingOpens+=1
        Task { @MainActor in
            defer{pendingOpens-=1}
            do {
                let imported=try await Task.detached(priority:.userInitiated){try await LegacyImporter.open(url)}.value
                let document=try GalleryDocument(project:imported.0,workspace:imported.1)
                addDocument(document);document.updateChangeCount(.changeDone)
                if display {document.makeWindowControllers();document.showWindows();document.editor?.issue="Legacy project opened as a separate native copy. Review the composition before exporting."}
                completionHandler(document,false,nil)
            } catch {completionHandler(nil,false,error)}
        }
    }
}
