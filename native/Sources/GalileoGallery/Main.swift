import AppKit
import SwiftUI
import GalileoCore
import GalileoNative

@main struct GalileoMain {
    @MainActor static func main() {
        let application=NSApplication.shared
        application.setActivationPolicy(.regular)
        let documents=GalleryDocumentController()
        let delegate=ApplicationDelegate(documents:documents)
        application.delegate=delegate
        application.mainMenu=makeMenu(delegate:delegate,documents:documents)
        withExtendedLifetime((documents,delegate)) {application.run()}
    }
    @MainActor private static func makeMenu(delegate:ApplicationDelegate,documents:GalleryDocumentController)->NSMenu {
        let menu=NSMenu()
        func submenu(_ title:String)->NSMenu {let item=NSMenuItem();item.title=title;let child=NSMenu(title:title);item.submenu=child;menu.addItem(item);return child}
        func command(_ parent:NSMenu,_ title:String,_ action:Selector,_ key:String="",target:AnyObject?=nil,modifiers:NSEvent.ModifierFlags = .command) {
            let item=NSMenuItem(title:title,action:action,keyEquivalent:key);item.target=target;item.keyEquivalentModifierMask=modifiers;parent.addItem(item)
        }
        let app=submenu("Galileo Gallery")
        command(app,"About Galileo Gallery",#selector(ApplicationDelegate.about(_:)),target:delegate)
        command(app,"Settings…",#selector(ApplicationDelegate.settings(_:)),",",target:delegate)
        app.addItem(.separator());let services=NSMenuItem(title:"Services",action:nil,keyEquivalent:"");services.submenu=NSMenu(title:"Services");app.addItem(services);NSApp.servicesMenu=services.submenu
        app.addItem(.separator());command(app,"Hide Galileo Gallery",#selector(NSApplication.hide(_:)),"h",target:NSApp)
        command(app,"Hide Others",#selector(NSApplication.hideOtherApplications(_:)),"h",target:NSApp,modifiers:[.command,.option]);command(app,"Show All",#selector(NSApplication.unhideAllApplications(_:)),target:NSApp)
        app.addItem(.separator());command(app,"Quit Galileo Gallery",#selector(NSApplication.terminate(_:)),"q",target:NSApp)
        let file=submenu("File")
        command(file,"New",#selector(NSDocumentController.newDocument(_:)),"n",target:documents)
        command(file,"Open…",#selector(NSDocumentController.openDocument(_:)),"o",target:documents)
        let recent=NSMenuItem(title:"Open Recent",action:nil,keyEquivalent:"");let recentMenu=NSMenu(title:"Open Recent");recentMenu.delegate=delegate;delegate.recentMenu=recentMenu;recent.submenu=recentMenu
        command(recentMenu,"Clear Menu",#selector(NSDocumentController.clearRecentDocuments(_:)),target:documents);file.addItem(recent)
        file.addItem(.separator());command(file,"Close",#selector(NSWindow.performClose(_:)),"w");command(file,"Save",#selector(NSDocument.save(_:)),"s")
        command(file,"Save As…",#selector(NSDocument.saveAs(_:)),"s",modifiers:[.command,.shift]);command(file,"Revert to Saved…",#selector(NSDocument.revertToSaved(_:)))
        file.addItem(.separator());command(file,"Add Media…",#selector(GalleryDocument.addMedia(_:)),"i");command(file,"Export…",#selector(GalleryDocument.exportDocument(_:)),"e")
        file.addItem(.separator());command(file,"Save Scene Preset…",#selector(GalleryDocument.saveScenePreset(_:)));command(file,"Apply Scene Preset…",#selector(GalleryDocument.openScenePreset(_:)))
        let edit=submenu("Edit")
        command(edit,"Undo",NSSelectorFromString("undo:"),"z");command(edit,"Redo",NSSelectorFromString("redo:"),"z",modifiers:[.command,.shift]);edit.addItem(.separator())
        command(edit,"Cut",#selector(NSText.cut(_:)),"x");command(edit,"Copy",#selector(NSText.copy(_:)),"c");command(edit,"Paste",#selector(NSText.paste(_:)),"v");command(edit,"Select All",#selector(NSText.selectAll(_:)),"a")
        edit.addItem(.separator());command(edit,"Duplicate Media",#selector(GalleryDocument.duplicateMedia(_:)),"d");command(edit,"Remove Media",#selector(GalleryDocument.removeMedia(_:)))
        command(edit,"Move Earlier",#selector(GalleryDocument.moveMediaEarlier(_:)),String(UnicodeScalar(NSUpArrowFunctionKey)!),modifiers:.option)
        command(edit,"Move Later",#selector(GalleryDocument.moveMediaLater(_:)),String(UnicodeScalar(NSDownArrowFunctionKey)!),modifiers:.option)
        let view=submenu("View")
        command(view,"Scenes…",#selector(GalleryDocument.chooseScene(_:)),"1");command(view,"Show/Hide Media",#selector(GalleryDocument.toggleSidebar(_:)),"0")
        command(view,"Show/Hide Inspector",#selector(GalleryDocument.toggleInspector(_:)),"2")
        view.addItem(.separator());command(view,"Play/Pause",#selector(GalleryDocument.togglePlayback(_:)))
        command(view,"Previous Frame",#selector(GalleryDocument.previousFrame(_:)))
        command(view,"Next Frame",#selector(GalleryDocument.nextFrame(_:)))
        view.addItem(.separator());command(view,"Enter Full Screen",#selector(NSWindow.toggleFullScreen(_:)),"f",modifiers:[.command,.control])
        let window=submenu("Window");NSApp.windowsMenu=window
        command(window,"Minimize",#selector(NSWindow.performMiniaturize(_:)),"m");command(window,"Zoom",#selector(NSWindow.performZoom(_:)))
        command(window,"Exports",#selector(ApplicationDelegate.showExports(_:)),"e",target:delegate,modifiers:[.command,.shift]);window.addItem(.separator());command(window,"Bring All to Front",#selector(NSApplication.arrangeInFront(_:)),target:NSApp)
        let help=submenu("Help");NSApp.helpMenu=help
        command(help,"Galileo Gallery Help",#selector(ApplicationDelegate.help(_:)),target:delegate)
        return menu
    }
}
@MainActor final class ApplicationDelegate:NSObject,NSApplicationDelegate,NSMenuDelegate {
    weak var recentMenu:NSMenu?
    let documents:GalleryDocumentController
    private var exportWindow:NSWindowController?
    private var settingsWindow:NSWindowController?
    private var exportObserver:NSObjectProtocol?
    private var quitPending=false
    init(documents:GalleryDocumentController) {self.documents=documents;super.init()}
    func applicationDidFinishLaunching(_ notification:Notification) {
        applyAppearance()
        exportObserver=NotificationCenter.default.addObserver(forName:.showExports,object:nil,queue:.main) { [weak self] _ in MainActor.assumeIsolated {self?.showExports(nil)} }
        if let index=CommandLine.arguments.firstIndex(of:"--smoke"),CommandLine.arguments.indices.contains(index+1) {
            let url=URL(fileURLWithPath:CommandLine.arguments[index+1],isDirectory:true)
            Task { @MainActor in
                do {try await ApplicationSmoke.run(directory:url,documents:documents);fflush(stdout);exit(0)}
                catch {fputs("NATIVE SMOKE FAILED: \(error)\n",stderr);exit(1)}
            }
        } else {
            NSApp.activate(ignoringOtherApps:true)
            if documents.documents.isEmpty && documents.pendingOpens==0 {documents.newDocument(nil)}
        }
    }
    func applicationSupportsSecureRestorableState(_ app:NSApplication)->Bool {true}
    func applicationShouldOpenUntitledFile(_ sender:NSApplication)->Bool {false}
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows:Bool)->Bool {
        let open=documents.documents.compactMap{$0 as? GalleryDocument}
        if let document=open.first {document.showWindows()} else {documents.newDocument(nil)}
        return false
    }
    func application(_ application:NSApplication,open urls:[URL]) {
        for url in urls {documents.openDocument(withContentsOf:url,display:true) {_,_,error in if let error {application.presentError(error)}}}
    }
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply {
        guard !quitPending else {return .terminateCancel}
        if !ExportCenter.shared.busy {
            guard !documents.documents.isEmpty else { return .terminateNow }
            quitPending=true
            DispatchQueue.main.async { [self] in
                documents.closeAllDocuments(withDelegate:self,didCloseAllSelector:#selector(documentController(_:didCloseAll:contextInfo:)),contextInfo:nil)
            }
            return .terminateLater
        }
        let alert=NSAlert();alert.messageText="An export is running.";alert.informativeText="Keep the app open to finish, or cancel the export before quitting."
        alert.addButton(withTitle:"Keep Exporting");alert.addButton(withTitle:"Cancel Export and Quit")
        guard alert.runModal() == .alertSecondButtonReturn else {return .terminateCancel}
        quitPending=true;ExportCenter.shared.cancel()
        Task { @MainActor in
            while ExportCenter.shared.busy {try? await Task.sleep(nanoseconds:50_000_000)}
            quitPending=false;NSApp.terminate(nil)
        }
        return .terminateCancel
    }
    @objc private func documentController(_ controller:NSDocumentController,didCloseAll:Bool,contextInfo:UnsafeMutableRawPointer?) {
        quitPending=false
        NSApp.reply(toApplicationShouldTerminate:didCloseAll)
    }
    func menuNeedsUpdate(_ menu:NSMenu) {
        guard menu === recentMenu else{return}
        menu.removeAllItems()
        for url in documents.recentDocumentURLs {
            let item=NSMenuItem(title:url.deletingPathExtension().lastPathComponent,action:#selector(openRecent(_:)),keyEquivalent:"")
            item.target=self;item.representedObject=url;menu.addItem(item)
        }
        if !menu.items.isEmpty{menu.addItem(.separator())}
        let clear=NSMenuItem(title:"Clear Menu",action:#selector(NSDocumentController.clearRecentDocuments(_:)),keyEquivalent:"");clear.target=documents;menu.addItem(clear)
    }
    @objc func openRecent(_ sender:NSMenuItem) {
        guard let url=sender.representedObject as? URL else{return}
        documents.openDocument(withContentsOf:url,display:true){_,_,error in if let error{NSApp.presentError(error)}}
    }
    @objc func showExports(_ sender:Any?) {
        if exportWindow==nil {exportWindow=window(title:"Exports",view:ExportsView(),size:NSSize(width:510,height:240))}
        exportWindow?.showWindow(nil);exportWindow?.window?.makeKeyAndOrderFront(nil)
    }
    @objc func settings(_ sender:Any?) {
        if settingsWindow==nil {settingsWindow=window(title:"Settings",view:SettingsView(),size:NSSize(width:440,height:210))}
        settingsWindow?.showWindow(nil);settingsWindow?.window?.makeKeyAndOrderFront(nil)
    }
    @objc func about(_ sender:Any?) {
        NSApp.orderFrontStandardAboutPanel(options:[.applicationName:"Galileo Gallery",.credits:NSAttributedString(string:"A native motion studio by pitch.dog.\nGPL-3.0. Original scene authorship is preserved in the source notices.")])
    }
    @objc func help(_ sender:Any?) {
        if let url=Bundle.main.url(forResource:"Help",withExtension:"html") {NSWorkspace.shared.open(url)}
    }
    private func window<V:View>(title:String,view:V,size:NSSize)->NSWindowController {
        let window=NSWindow(contentRect:NSRect(origin:.zero,size:size),styleMask:[.titled,.closable],backing:.buffered,defer:false)
        window.title=title;window.isReleasedWhenClosed=false;window.contentView=NSHostingView(rootView:view);window.center();return NSWindowController(window:window)
    }
}
@MainActor func applyAppearance() {
    switch UserDefaults.standard.string(forKey:"interfaceAppearance") ?? "system" {
    case "light":NSApp.appearance=NSAppearance(named:.aqua)
    case "dark":NSApp.appearance=NSAppearance(named:.darkAqua)
    default:NSApp.appearance=nil
    }
}
struct SettingsView:View {
    @AppStorage("interfaceAppearance") private var appearance="system"
    var body:some View {
        Form {
            Picker("Appearance",selection:$appearance) {Text("System").tag("system");Text("Light").tag("light");Text("Dark").tag("dark")}
            Text("Interface appearance never changes your exported artwork.").font(.callout).foregroundStyle(.secondary)
        }.formStyle(.grouped).padding(20).frame(width:440).onChange(of:appearance){ applyAppearance() }
    }
}
