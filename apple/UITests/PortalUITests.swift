import XCTest
import UIKit
import Vision

@MainActor final class PortalUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    @MainActor override func tearDown() async throws {
        // XCTest records some thrown failures after the test method unwinds.
        // Observe them here, rather than in that method's defer block.
        if name.contains("testHomeScreenWidget"), (testRun?.failureCount ?? 0) > 0 {
            capture("portal-widget-failed-screen")
            print(String(XCUIApplication(bundleIdentifier: "com.apple.springboard").debugDescription.prefix(24_000)))
        }
    }
    private func capture(_ name: String) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image)
    }
    // iOS 26's remote WidgetKit gallery renders controls which SpringBoard's
    // accessibility tree omits. Locate their actual visible text, then require
    // the resulting Home Screen/native app state. Never invent a widget host
    // or tap a guessed screen coordinate when the control is absent.
    private func visibleText(_ text: String, lowerPart: Bool = false, timeout: TimeInterval = 10) throws -> CGRect? {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            let image = try XCTUnwrap(XCUIScreen.main.screenshot().image.cgImage)
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["en-US"]
            request.usesLanguageCorrection = false
            try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
            let matches = try visibleSystemControlBounds(text, observations: request.results ?? [], lowerPart: lowerPart)
            XCTAssertLessThanOrEqual(matches.count, 1, "The visible control must be unambiguous: \(text)")
            if matches.count == 1 { return matches[0] }
            Thread.sleep(forTimeInterval: 0.4)
        } while Date() < deadline
        return nil
    }
    private func tapVisibleText(_ text: String, in application: XCUIApplication, lowerPart: Bool = false) throws {
        let bounds = try XCTUnwrap(visibleText(text, lowerPart: lowerPart), "Visible control missing: \(text)")
        let point = CGPoint(x: bounds.midX, y: 1 - bounds.midY)
        XCTAssertTrue(CGRect(x: 0, y: 0, width: 1, height: 1).contains(point))
        application.coordinate(withNormalizedOffset: CGVector(dx: point.x, dy: point.y)).tap()
    }
    func testOfflineLearningTrailAndRotation() throws {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.staticTexts["The Living Portal"].waitForExistence(timeout: 15))
        capture("portal-discover-portrait")
        let place = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Baltimore")).firstMatch
        XCTAssertTrue(place.waitForExistence(timeout: 5)); place.tap()
        let save = app.buttons["Save place"]
        XCTAssertTrue(save.waitForExistence(timeout: 5)); save.tap()
        XCTAssertTrue(app.buttons["Remove from saved places"].waitForExistence(timeout: 5))
        let investigate = app.buttons["Add to Investigated"]
        for _ in 0..<5 { if investigate.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(investigate.isHittable); investigate.tap()
        XCTAssertTrue(app.buttons["Investigated"].waitForExistence(timeout: 5))
        capture("portal-investigation")
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["Your Trail"].tap()
        XCTAssertTrue(app.staticTexts["Saved · Investigated"].waitForExistence(timeout: 5))
        capture("portal-trail-portrait")
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(app.staticTexts["Your Exploration Trail"].waitForExistence(timeout: 5))
        capture("portal-trail-landscape")
        XCUIDevice.shared.orientation = .portrait
        app.terminate(); app.launch(); app.buttons["Your Trail"].tap()
        XCTAssertTrue(app.staticTexts["Saved · Investigated"].waitForExistence(timeout: 5))
        app.buttons["Account"].tap()
        XCTAssertTrue(app.buttons["Connect your Explorer account"].waitForExistence(timeout: 10))
        capture("portal-account-device")
    }
    func testHomeScreenWidget() throws {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.staticTexts["The Living Portal"].waitForExistence(timeout: 15))
        XCUIDevice.shared.press(.home)
        let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let icon = home.icons["World Explorer 3D"]
        XCTAssertTrue(icon.waitForExistence(timeout: 10)); icon.press(forDuration: 1.5)
        // SpringBoard's remote menus can expose stale accessibility hit points
        // even when tap() reports success. Resolve each system action from its
        // actual visible state; the next required control proves the transition.
        try tapVisibleText("Edit Home Screen", in: home)
        try tapVisibleText("Edit", in: home)
        try tapVisibleText("Add Widget", in: home)
        let search = home.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        try tapVisibleText("Search Widgets", in: home)
        search.typeText("World Explorer"); search.typeText("\n")
        capture("portal-widget-gallery-search")
        XCTAssertEqual(search.value as? String, "World Explorer")
        try tapVisibleText("World Explorer 3D", in: home)
        capture("portal-widget-gallery")
        try tapVisibleText("Add Widget", in: home, lowerPart: true)
        try tapVisibleText("Done", in: home)
        capture("portal-widget-home-after-add")
        let wasSaved = try visibleText("Saved", timeout: 2) != nil
        if wasSaved { try tapVisibleText("Saved", in: home) }
        try tapVisibleText("Save", in: home)
        XCTAssertNotNil(try visibleText("Saved")); capture("portal-widget-home-saved")
        try tapVisibleText("Open", in: home)
        XCTAssertTrue(app.buttons["Remove from saved places"].waitForExistence(timeout: 10))
        capture("portal-widget-open-native-place")
        // Keep this journey independent of the learning/rotation test's order.
        if !wasSaved { app.buttons["Remove from saved places"].tap(); XCTAssertTrue(app.buttons["Save place"].waitForExistence(timeout: 5)) }
    }
}
