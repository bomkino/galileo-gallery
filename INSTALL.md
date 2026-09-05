# Install Galileo Gallery on a Mac

Requires an **Apple-silicon Mac** (M1 or later) running **macOS 14 or later**. No Terminal commands, Xcode, Homebrew or Node.js are needed for the released app.

## Replace the older app

1. Quit Galileo Gallery. In Finder, duplicate important `.galileo` projects before opening them in the new version. Keep an archived copy of the old app until you have checked a project and export.
2. Open [Releases](https://github.com/bomkino/galileo-gallery/releases/latest). Under **Assets**, download the file ending **`macOS-arm64.dmg`**. Do not download “Source code.”
3. Double-click the DMG. Drag **Galileo Gallery** onto **Applications**. Choose **Replace** when Finder asks about the existing app.
4. Eject the disk image. Open **Applications → Galileo Gallery**. Do not keep running the copy inside the DMG.

## First-launch security notice

This release is ad-hoc signed, not Developer ID signed or notarized. macOS may say the developer cannot be verified or Apple cannot check the app for malicious software.

After attempting to open the app, use **System Settings → Privacy & Security → Open Anyway**, then confirm Open. Use this only for the app you obtained from this repository's release. Never disable Gatekeeper globally. A “damaged” or malware warning is not the same thing: stop and verify the download rather than bypassing that warning.

[Apple's explanation and current instructions](https://support.apple.com/en-us/102445).

## Your first project

Use **Add** to import media. Select **Scene** to choose a composition. To hold a particular slide at the centre, select it in the Media list and enable **Bring to centre** in its inspector. Adjust Hold and Size. A video remains a regular frame; keep **Play source** and **Loop source** enabled to loop it during the hold.

Use **File → Save** to create a native `.galileo` document. Opening a ZIP-based legacy project makes a separate native copy and does not overwrite the legacy original. Save that copy with a different name. Native choreography can differ from old exports. Movies in this version are silent.

## Optional download verification

The release includes `SHA256SUMS.txt`. A checksum proves a download matches that release's file, not that software is bug-free or notarized. In Terminal, run `shasum -a 256` followed by a space, drag the downloaded DMG into the window, then press Return. Compare the result with the DMG entry in `SHA256SUMS.txt`.

## Roll back

Quit the new app and restore the archived older app. Open an untouched older project. Do not expect a version-2 native project package to open in the old Electron app.
