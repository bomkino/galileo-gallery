# Third-party notices

Galileo Gallery is built with Electron, React, Vite, TypeScript, and other open-source packages recorded with exact versions and integrity hashes in `package-lock.json`. Their respective licenses remain in force.

## pitch.dog type system

The packaged interface includes seven WOFF2 files from the public [`bomkino/pitchdog-type-system`](https://github.com/bomkino/pitchdog-type-system), pinned at commit `786b4a2b671182319320f922b8de8f927ea3a002`.

The copied upstream font notice and provenance manifest are preserved under `docs/third-party/pitchdog-type-system/`. The exact packaged-file manifest is `src/assets/fonts/SOURCE.json`.

## Phosphor Icons

Product-control icons use [`@phosphor-icons/react`](https://github.com/phosphor-icons/react) version `2.1.10`, distributed under the MIT License. Copyright remains with the Phosphor contributors.

## Project archives

Project archives are written with [`adm-zip`](https://github.com/cthackers/adm-zip) and read through the lazy streaming API in [`yauzl`](https://github.com/thejoshwolfe/yauzl), including its `pend` dependency. These packages are distributed under the MIT License.

## FFmpeg

Packaged applications include an FFmpeg executable supplied by [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static). FFmpeg and `ffmpeg-static` are distributed under the GNU General Public License, version 3 or later, subject to the configuration of the supplied binary. The matching license is copied beside the binary during packaging. FFmpeg source and build information are available from the upstream project and binary provider.

## Project artwork

Galileo Gallery artwork and app identity assets are distributed under GPL-3.0-or-later unless a file states otherwise. Phosphor interface icons and pitch.dog font files remain governed by their notices above.
