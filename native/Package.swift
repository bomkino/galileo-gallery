// swift-tools-version: 5.10
import PackageDescription

var products: [Product] = [.library(name: "GalileoCore", targets: ["GalileoCore"])]
var dependencies: [Package.Dependency] = []
var targets: [Target] = [
    .systemLibrary(name: "CZlib", pkgConfig: "zlib"),
    .target(name: "GalileoCore", dependencies: ["CZlib"]),
    .testTarget(name: "GalileoCoreTests", dependencies: ["GalileoCore"]),
]
#if os(macOS)
dependencies.append(.package(url: "https://github.com/bomkino/pitchdog-studio-ui.git", revision: "8f296630180ea4dbc77fe65a9c86e88a5b9bb9c0"))
products += [.executable(name: "GalileoGallery", targets: ["GalileoGallery"])]
targets += [
    .target(name: "GalileoNative", dependencies: ["GalileoCore"], resources: [.copy("Resources")]),
    .executableTarget(name: "GalileoGallery", dependencies: ["GalileoNative", "GalileoCore", .product(name: "PitchdogStudioUI", package: "pitchdog-studio-ui")]),
    .testTarget(name: "GalileoNativeTests", dependencies: ["GalileoNative", "GalileoCore"], resources:[.copy("Fixtures")]),
]
#endif
let package = Package(name: "GalileoGallery", platforms: [.macOS(.v14)], products: products, dependencies: dependencies, targets: targets)
