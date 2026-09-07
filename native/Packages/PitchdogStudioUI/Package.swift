// swift-tools-version: 5.10
import PackageDescription

var products: [Product] = [.library(name: "PitchdogStudioUI", targets: ["PitchdogStudioUI"])]
var targets: [Target] = [
    .target(name: "PitchdogStudioUI"),
    .testTarget(name: "PitchdogStudioUITests", dependencies: ["PitchdogStudioUI"])
]
#if os(macOS)
products.append(.executable(name: "StudioUISpecimen", targets: ["StudioUISpecimen"]))
targets.append(.executableTarget(name: "StudioUISpecimen", dependencies: ["PitchdogStudioUI"]))
#endif
let package = Package(name: "PitchdogStudioUI", platforms: [.macOS("13.3")],
                      products: products, targets: targets, swiftLanguageVersions: [.v5])
