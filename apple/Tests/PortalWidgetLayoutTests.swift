import XCTest
import SwiftUI
import WidgetKit
import UIKit
@testable import WorldExplorerPortal

@MainActor final class PortalWidgetLayoutTests: XCTestCase {
    // Controlled UIKit-hosted renders of the exact extension view. These are
    // layout evidence, not actual medium/large Home Screen or device receipts.
    func testCurrentWidgetCompositions() async throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "portal-catalog", withExtension: "json"))
        let catalog = try JSONDecoder().decode(PortalCatalog.self, from: Data(contentsOf: url))
        let place = try XCTUnwrap(catalog.place("baltimore-harbor"))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let previousWindow = scene.windows.first { $0.isKeyWindow }
        defer { previousWindow?.makeKeyAndVisible() }
        let sizes: [(String, WidgetFamily, CGFloat, CGFloat)] = [
            ("small", .systemSmall, 158, 158), ("medium", .systemMedium, 338, 158), ("large", .systemLarge, 338, 354)
        ]
        for (name, family, width, height) in sizes {
            for scale in [DynamicTypeSize.large, .accessibility2] {
                let entry = PortalWidgetEntry(date: .now, configuration: PortalConfiguration(), place: place)
                try await capture(entry, family: family, scale: scale, width: width, height: height, scene: scene, name: "roam-widget-\(name)-\(scale == .large ? "normal" : "accessibility2")")
            }
        }
        let longest = try XCTUnwrap(place.facts.indices.max { place.facts[$0].count < place.facts[$1].count })
        let reading = PortalWidgetEntry(date: .now, configuration: PortalConfiguration(), place: place,
            page: PortalLearningPage(destinationId: place.id, contentVersion: place.learning.version, index: longest))
        for scale in [DynamicTypeSize.large, .accessibility2] {
            try await capture(reading, family: .systemLarge, scale: scale, width: 338, height: 354, scene: scene,
                              name: "roam-widget-fact-\(scale == .large ? "normal" : "accessibility2")")
        }
    }
    private func capture(_ entry: PortalWidgetEntry, family: WidgetFamily, scale: DynamicTypeSize,
                         width: CGFloat, height: CGFloat, scene: UIWindowScene, name: String) async throws {
        let root = PortalWidgetComposition(entry: entry, family: family).environment(\.dynamicTypeSize, scale)
            .padding(16).frame(width: width, height: height).background(PortalStyle.card).environment(\.colorScheme, .dark)
        let controller = UIHostingController(rootView: root); controller.safeAreaRegions = []
        let container = UIViewController(), window = UIWindow(windowScene: scene)
        window.rootViewController = container
        container.addChild(controller); container.view.addSubview(controller.view); controller.didMove(toParent: container)
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        controller.view.frame = CGRect(x: 0, y: 0, width: width, height: height)
        controller.view.setNeedsLayout(); controller.view.layoutIfNeeded()
        try await Task.sleep(for: .milliseconds(200))
        let format = UIGraphicsImageRendererFormat(); format.scale = 2
        let image = UIGraphicsImageRenderer(size: controller.view.bounds.size, format: format).image { _ in
            XCTAssertTrue(controller.view.drawHierarchy(in: controller.view.bounds, afterScreenUpdates: true))
        }
        XCTAssertEqual(image.size, CGSize(width: width, height: height))
        let attachment = XCTAttachment(image: image); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
