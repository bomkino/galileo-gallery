import Foundation
import CZlib

/// A bounded ZIP reader for importing existing .galileo documents. It never extracts paths.
/// Callers receive validated names and bytes, and choose their own content-addressed destinations.
public struct SafeZIP {
    public struct Entry {
        public let name: String
        public let size: Int
        public let isDirectory: Bool
        fileprivate let offset: Int
        fileprivate let compressedSize: Int
        fileprivate let method: UInt16
        fileprivate let crc: UInt32
    }
    private let data: Data
    public let entries: [Entry]
    public init(data: Data, maximumExpandedBytes: Int = 4 * 1024 * 1024 * 1024, maximumEntryBytes: Int = 512 * 1024 * 1024) throws {
        guard data.count >= 22, data.count <= 2 * 1024 * 1024 * 1024 else { throw GalleryError.invalid("The project archive is truncated or exceeds 2 GB.") }
        self.data = data
        func u16(_ at: Int) throws -> UInt16 { try Self.u16(data,at) }
        func u32(_ at: Int) throws -> UInt32 { try Self.u32(data,at) }
        var end: Int? = nil
        for offset in stride(from:data.count-22,through:max(0,data.count-65557),by:-1) {
            if try u32(offset)==0x06054b50, offset+22+Int(try u16(offset+20))==data.count { end=offset; break }
        }
        guard let end else { throw GalleryError.invalid("The project archive has no complete directory.") }
        guard try u16(end+4)==0, try u16(end+6)==0, try u16(end+8)==u16(end+10) else { throw GalleryError.unsupported("Multipart project archives are not supported.") }
        let count=Int(try u16(end+10)),centralBytes=Int(try u32(end+12)),centralStart=Int(try u32(end+16))
        guard count>0,count<=2048,centralStart+centralBytes==end else { throw GalleryError.invalid("The project archive directory is invalid.") }
        var offset=centralStart,total=0,seen=Set<String>(),result:[Entry]=[],regions:[Range<Int>]=[]
        for _ in 0..<count {
            guard try u32(offset)==0x02014b50 else { throw GalleryError.invalid("The project archive directory is damaged.") }
            let flags=try u16(offset+8),method=try u16(offset+10),crc=try u32(offset+16)
            let compressed=Int(try u32(offset+20)),size=Int(try u32(offset+24))
            let nameLength=Int(try u16(offset+28)),extraLength=Int(try u16(offset+30)),commentLength=Int(try u16(offset+32))
            let external=try u32(offset+38),local=Int(try u32(offset+42))
            guard try u16(offset+34)==0, flags & 0xF7F1 == 0, [UInt16(0),8].contains(method) else { throw GalleryError.unsupported("Encrypted or unsupported project archives cannot be opened.") }
            let nameEnd=offset+46+nameLength,next=nameEnd+extraLength+commentLength
            guard nameLength>0,nameLength<=512,next<=end else { throw GalleryError.invalid("The project archive has an invalid entry.") }
            guard let name=String(data:data.subdata(in:offset+46..<nameEnd),encoding:.utf8) else { throw GalleryError.invalid("The archive contains an invalid filename.") }
            let directory=name.hasSuffix("/"),trimmed=directory ? String(name.dropLast()):name
            let parts=trimmed.split(separator:"/",omittingEmptySubsequences:false)
            guard !parts.isEmpty,!name.contains("\\"),!name.contains(":"),!name.hasPrefix("/"),!name.unicodeScalars.contains(where:{$0.value<32}),parts.allSatisfy({!$0.isEmpty && $0 != "." && $0 != ".."}) else { throw GalleryError.invalid("The archive contains an unsafe path.") }
            let key=trimmed.precomposedStringWithCanonicalMapping.lowercased()
            guard seen.insert(key).inserted else { throw GalleryError.invalid("The archive contains colliding filenames.") }
            let mode=(external>>16)&0xF000
            guard mode==0 || mode==0x8000 || (directory && mode==0x4000) else { throw GalleryError.invalid("The archive contains a link or special file.") }
            guard size<=maximumEntryBytes,total<=maximumExpandedBytes-size else { throw GalleryError.invalid("The project exceeds the import size budget.") }
            total+=size
            guard !directory || size==0 else { throw GalleryError.invalid("A project directory contains unexpected data.") }
            guard local>=0,local+30<=centralStart,try u32(local)==0x04034b50 else { throw GalleryError.invalid("The project archive has an invalid local header.") }
            guard try u16(local+6)==flags,try u16(local+8)==method else { throw GalleryError.invalid("The project archive headers disagree.") }
            let localNameSize=Int(try u16(local+26)),localExtra=Int(try u16(local+28)),payload=local+30+localNameSize+localExtra
            guard payload<=centralStart,payload+compressed<=centralStart,localNameSize==nameLength,
                  data.subdata(in:local+30..<local+30+localNameSize)==data.subdata(in:offset+46..<nameEnd) else { throw GalleryError.invalid("The project archive entry is truncated.") }
            if flags & 8 == 0 {
                guard try u32(local+14)==crc,Int(try u32(local+18))==compressed,Int(try u32(local+22))==size else { throw GalleryError.invalid("The project archive sizes disagree.") }
            }
            if method==0 && size != compressed { throw GalleryError.invalid("A stored project entry has an invalid size.") }
            let region=local..<payload+compressed
            guard !regions.contains(where:{$0.overlaps(region)}) else { throw GalleryError.invalid("The project archive has overlapping entries.") }
            regions.append(region)
            result.append(Entry(name:name,size:size,isDirectory:directory,offset:payload,compressedSize:compressed,method:method,crc:crc))
            offset=next
        }
        guard offset==end else { throw GalleryError.invalid("The project archive directory size is inconsistent.") }
        entries=result
    }
    public func contents(of name:String) throws -> Data {
        guard let entry=entries.first(where:{$0.name==name && !$0.isDirectory}) else { throw GalleryError.missing("The project archive is missing \(name).") }
        var output:Data
        if entry.method==0 { output=data.subdata(in:entry.offset..<entry.offset+entry.compressedSize) }
        else {
            output=Data(count:max(1,entry.size))
            var stream=z_stream()
            guard inflateInit2_(&stream,-MAX_WBITS,ZLIB_VERSION,Int32(MemoryLayout<z_stream>.size))==Z_OK else { throw GalleryError.invalid("The archive decoder could not start.") }
            defer { inflateEnd(&stream) }
            let code:Int32=data.withUnsafeBytes { raw in
                output.withUnsafeMutableBytes { destination in
                    stream.next_in=UnsafeMutablePointer(mutating:raw.baseAddress!.assumingMemoryBound(to:Bytef.self).advanced(by:entry.offset))
                    stream.avail_in=uInt(entry.compressedSize)
                    stream.next_out=destination.baseAddress!.assumingMemoryBound(to:Bytef.self)
                    stream.avail_out=uInt(max(1,entry.size))
                    return inflate(&stream,Z_FINISH)
                }
            }
            guard code==Z_STREAM_END,stream.total_out==entry.size,stream.total_in==entry.compressedSize else { throw GalleryError.invalid("A project entry could not be decompressed safely.") }
            output.count=entry.size
        }
        let crc=output.withUnsafeBytes { raw in UInt32(CZlib.crc32(0,raw.baseAddress?.assumingMemoryBound(to:Bytef.self),uInt(raw.count))) }
        guard crc==entry.crc else { throw GalleryError.invalid("A project entry failed its integrity check.") }
        return output
    }
    private static func u16(_ d:Data,_ i:Int)throws->UInt16 {
        guard i>=0,i<=d.count-2 else { throw GalleryError.invalid("The project archive is truncated.") }
        return UInt16(d[i]) | UInt16(d[i+1])<<8
    }
    private static func u32(_ d:Data,_ i:Int)throws->UInt32 {
        guard i>=0,i<=d.count-4 else { throw GalleryError.invalid("The project archive is truncated.") }
        return UInt32(d[i]) | UInt32(d[i+1])<<8 | UInt32(d[i+2])<<16 | UInt32(d[i+3])<<24
    }
}
