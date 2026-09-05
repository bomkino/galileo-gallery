import Foundation
import CryptoKit
import GalileoCore

public struct SavedPreset: Identifiable {
    public let id: String
    public let preset: ScenePreset
}
public enum PresetStore {
    private static func directory() throws -> URL {
        let root=try FileManager.default.url(for:.applicationSupportDirectory,in:.userDomainMask,appropriateFor:nil,create:true)
            .appendingPathComponent("Galileo Gallery/Presets",isDirectory:true)
        try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
        return root
    }
    public static func save(_ preset:ScenePreset)throws {
        try preset.validate()
        let encoder=JSONEncoder();encoder.outputFormatting=[.prettyPrinted,.sortedKeys]
        let data=try encoder.encode(preset),root=try directory()
        let hash=SHA256.hash(data:data).map {String(format:"%02x",$0)}.joined()
        let target=root.appendingPathComponent(hash+".galileo-preset")
        let files=try FileManager.default.contentsOfDirectory(at:root,includingPropertiesForKeys:nil)
        guard files.count<256 || FileManager.default.fileExists(atPath:target.path) else {throw GalleryError.invalid("The local preset library is full. Keep the preset file in your chosen folder.")}
        try data.write(to:target,options:.atomic)
    }
    public static func load()throws->[SavedPreset] {
        let root=try directory()
        return try FileManager.default.contentsOfDirectory(at:root,includingPropertiesForKeys:nil).filter{$0.pathExtension=="galileo-preset"}.prefix(256).compactMap { url in
            guard let stamp=try? FileStamp(url),stamp.size<=1024*1024,let data=try? Data(contentsOf:url),let preset=try? JSONDecoder().decode(ScenePreset.self,from:data),(try? preset.validate()) != nil else {return nil}
            return SavedPreset(id:url.lastPathComponent,preset:preset)
        }.sorted{$0.preset.name.localizedStandardCompare($1.preset.name) == .orderedAscending}
    }
}
