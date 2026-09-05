// swift-tools-version: 5.10
import PackageDescription

var products: [Product] = [.library(name: "GalileoCore", targets: ["GalileoCore"])]
var targets: [Target] = [
    .systemLibrary(name: "CZlib", pkgConfig: "zlib"),
    .target(name: "GalileoCore", dependencies: ["CZlib"]),
    .testTarget(name: "GalileoCoreTests", dependencies: ["GalileoCore"]),
]
#if os(macOS)
products += [.executable(name: "GalileoGallery", targets: ["GalileoGallery"])]
targets += [
    .target(name: "GalileoNative", dependencies: ["GalileoCore"]),
    .executableTarget(name: "GalileoGallery", dependencies: ["GalileoNative", "GalileoCore"]),
    .testTarget(name: "GalileoNativeTests", dependencies: ["GalileoNative", "GalileoCore"]),
]
#endif
let package = Package(name: "GalileoGallery", platforms: [.macOS(.v14)], products: products, targets: targets)
