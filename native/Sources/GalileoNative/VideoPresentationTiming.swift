import AVFoundation
import GalileoCore

/// Reads declared sample-table duration when a decoded buffer omits it. No FPS
/// estimate or duration-minus-epsilon fallback; explicit empty edits stay empty.
enum VideoPresentationTiming {
    static func interval(track:AVAssetTrack,pts:CMTime,duration:CMTime)throws->SourceInterval {
        var declared=duration
        guard pts.isNumeric else {throw GalleryError.invalid("The source has an invalid presentation timestamp.")}
        if !declared.isNumeric || CMTimeCompare(declared,.zero)<=0 {
            guard let cursor=track.makeSampleCursor(presentationTimeStamp:pts),
                  CMTimeCompare(cursor.presentationTimeStamp,pts)==0 else {
                throw GalleryError.invalid("The source does not declare this exact picture's timing.")
            }
            declared=cursor.currentSampleDuration
        }
        guard declared.isNumeric,CMTimeCompare(declared,.zero)>0 else {
            throw GalleryError.invalid("The source does not declare an exact displayed-picture duration.")
        }
        var end=CMTimeAdd(pts,declared)
        guard !end.flags.contains(.hasBeenRounded) else {throw GalleryError.invalid("Source-picture timing exceeds the supported precision.")}
        // Segment targets use the track presentation timeline. Never extend a
        // picture across an empty edit, including a final empty segment.
        if !track.segments.isEmpty {
            guard let segment=track.segments.first(where:{CMTimeRangeContainsTime($0.timeMapping.target,time:pts)}),!segment.isEmpty else {
                throw GalleryError.invalid("The requested source picture lies in a timeline gap.")
            }
            end=CMTimeMinimum(end,CMTimeRangeGetEnd(segment.timeMapping.target))
        }
        return try SourceInterval(start:SourceTime(pts),end:SourceTime(end))
    }
}
