import Foundation
import Darwin
import AVFoundation
import GalileoCore

/// Local-only, version-pinned compatibility conversion. The helper has no
/// network protocols; user paths are arguments, never shell commands.
public enum MediaCompatibility {
    public static let recipe="webm-prores-v1-ffmpeg8.1.2-libvpx1.15.2"
    private static func executable(_ name:String) throws -> URL {
        if let resources=Bundle.main.resourceURL {
            let bundled=resources.appendingPathComponent("MediaTools/\(name)")
            if FileManager.default.isExecutableFile(atPath:bundled.path) {return bundled}
        }
        // Only source-tree tests/development use this path; packaged apps never
        // search PATH or silently execute an unrelated Homebrew program.
        let source=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(".codecs/bin/\(name)")
        guard FileManager.default.isExecutableFile(atPath:source.path) else {throw GalleryError.missing("The bundled WebM decoder is missing. Reinstall Galileo Gallery.")}
        return source
    }
    static func run(_ tool:String,arguments:[String],workspace:Workspace,timeout:Double,
                    monitoredOutput:URL?=nil,maximumBytes:Int64=MediaBudget.maximumDerivedFileBytes) async throws -> Data {
        let exe=try executable(tool),fm=FileManager.default
        let job=workspace.root.appendingPathComponent("codec-\(UUID().uuidString)",isDirectory:true)
        try fm.createDirectory(at:job,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        defer {try? fm.removeItem(at:job)}
        let stdout=job.appendingPathComponent("stdout"),stderr=job.appendingPathComponent("stderr")
        fm.createFile(atPath:stdout.path,contents:nil);fm.createFile(atPath:stderr.path,contents:nil)
        let out=try FileHandle(forWritingTo:stdout),err=try FileHandle(forWritingTo:stderr)
        defer {try? out.close();try? err.close()}
        let process=Process();process.executableURL=exe;process.arguments=arguments
        process.standardOutput=out;process.standardError=err;process.standardInput=FileHandle.nullDevice
        process.currentDirectoryURL=job;process.environment=["PATH":"/usr/bin:/bin","HOME":job.path,"TMPDIR":job.path,"LC_ALL":"C"]
        let start=ProcessInfo.processInfo.systemUptime
        try Task.checkCancellation();try process.run()
        do {
            while process.isRunning {
                try Task.checkCancellation()
                guard ProcessInfo.processInfo.systemUptime-start<timeout else {throw GalleryError.invalid("Media preparation timed out. Try a shorter clip.")}
                for file in [stdout,stderr] {
                    if let size=try? FileStamp(file).size,size>4*1024*1024 {throw GalleryError.invalid("The media decoder produced excessive diagnostics.")}
                }
                if let monitoredOutput,let size=try? FileStamp(monitoredOutput).size,size>maximumBytes {throw GalleryError.invalid("The native working movie exceeds 4 GiB. Use a shorter or smaller WebM; the original is unchanged.")}
                if let free=try? job.resourceValues(forKeys:[.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage,free<128*1024*1024 {throw GalleryError.invalid("There is not enough free space to prepare this media.")}
                try await Task.sleep(nanoseconds:100_000_000)
            }
        } catch {
            if process.isRunning {process.terminate()}
            // A bounded termination grace period, without keeping a cancelled
            // task's decoder alive or waiting for an uncooperative child forever.
            for _ in 0..<20 where process.isRunning {Darwin.usleep(25_000)}
            if process.isRunning {Darwin.kill(process.processIdentifier,SIGKILL)}
            process.waitUntilExit();throw error
        }
        process.waitUntilExit()
        guard process.terminationStatus==0 else {
            let diagnostic=String(data:(try? Data(contentsOf:stderr)) ?? Data(),encoding:.utf8) ?? "Unknown codec error"
            throw GalleryError.invalid("Media preparation failed: \(String(diagnostic.suffix(1200)))")
        }
        return try Data(contentsOf:stdout)
    }
    static func prepareWebM(_ original:URL,name:String,hash:String,workspace:Workspace) async throws -> MediaItem {
        while !(await CompatibilitySlots.shared.acquire()) {
            try Task.checkCancellation();try await Task.sleep(nanoseconds:100_000_000)
        }
        defer {Task {await CompatibilitySlots.shared.release()}}
        try Task.checkCancellation()
        let probe=try await run("ffprobe",arguments:["-v","error","-protocol_whitelist","file,pipe","-select_streams","v:0","-show_streams","-show_format","-of","json",original.path],workspace:workspace,timeout:20)
        guard let json=try JSONSerialization.jsonObject(with:probe) as? [String:Any],let stream=(json["streams"] as? [[String:Any]])?.first,
              let codec=stream["codec_name"] as? String, let width=stream["width"] as? Int, let height=stream["height"] as? Int,
              width>0,height>0,width<=8192,height<=8192,width*height<=33_177_600 else {throw GalleryError.invalid("\(name) has an invalid or oversized WebM picture track.")}
        guard ["vp8","vp9"].contains(codec) else {throw GalleryError.unsupported("\(name) uses \(codec.uppercased()). This release imports VP8/VP9 WebM; AV1 WebM is not supported.")}
        let transfer=stream["color_transfer"] as? String ?? "unknown"
        guard !["smpte2084","arib-std-b67"].contains(transfer) else {throw GalleryError.unsupported("\(name) is HDR WebM. Convert it to SDR before importing; Galileo will not silently change its brightness.")}
        let tags=stream["tags"] as? [String:Any] ?? [:]
        let alpha=[tags["alpha_mode"],tags["ALPHA_MODE"]].contains { value in (value as? String)=="1" || (value as? Int)==1 }
        let temporary=workspace.root.appendingPathComponent("working-\(UUID().uuidString).mov")
        defer {try? FileManager.default.removeItem(at:temporary)}
        var args=["-hide_banner","-nostdin","-v","error","-xerror","-n","-max_alloc","268435456","-protocol_whitelist","file,pipe",
                  "-threads","2","-c:v",codec=="vp9" ? "libvpx-vp9":"libvpx","-f","matroska","-i",original.path,
                  "-map","0:v:0","-an","-sn","-dn","-fps_mode","passthrough","-copyts","-start_at_zero"]
        if let sar=stream["sample_aspect_ratio"] as? String,sar != "1:1",sar != "N/A",sar != "0:1" {
            args += ["-vf","scale=trunc(iw*sar/2)*2:ih,setsar=1"]
        }
        args += ["-c:v","prores_ks","-threads","2","-profile:v",alpha ? "4":"3","-pix_fmt",alpha ? "yuva444p10le":"yuv422p10le"]
        if alpha {args += ["-alpha_bits","16"]}
        args += ["-movflags","+faststart",temporary.path]
        _=try await run("ffmpeg",arguments:args,workspace:workspace,timeout:900,monitoredOutput:temporary)
        try Task.checkCancellation()
        let size=try FileStamp(temporary).size
        guard size>0,size<=MediaBudget.maximumDerivedFileBytes else {throw GalleryError.invalid("The prepared movie is empty or exceeds its storage budget.")}
        let derivedHash=try Workspace.fingerprint(temporary)
        var item=try await AssetImporter.metadata(temporary,name:name,hash:derivedHash)
        let target=workspace.assets.appendingPathComponent(derivedHash+".galileo-work.mov")
        if !FileManager.default.fileExists(atPath:target.path) {try FileManager.default.moveItem(at:temporary,to:target)}
        item.asset=target.lastPathComponent;item.originalAsset=original.lastPathComponent;item.originalSHA256=hash
        item.derivation=recipe;item.hasAlpha=alpha
        return item
    }
}

private actor CompatibilitySlots {
    static let shared=CompatibilitySlots()
    private var active=0
    func acquire()->Bool {guard active<2 else{return false};active+=1;return true}
    func release() {active=max(0,active-1)}
}
