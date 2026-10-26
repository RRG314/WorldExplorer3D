import XCTest
import UIKit
import Vision

@MainActor final class PortalUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
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
            let matches = (request.results ?? []).compactMap { observation -> CGRect? in
                guard let candidate = observation.topCandidates(1).first, candidate.confidence >= 0.6 else { return nil }
                let value = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
                let exact = value.caseInsensitiveCompare(text) == .orderedSame
                let plusLabel = text == "Add Widget" && value.hasSuffix(text) && value.count <= text.count + 3
                guard exact || plusLabel, !lowerPart || observation.boundingBox.midY < 0.35 else { return nil }
                return observation.boundingBox
            }
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
        defer {
            if (testRun?.failureCount ?? 0) > 0 {
                capture("portal-widget-failed-screen")
                print(String(XCUIApplication(bundleIdentifier: "com.apple.springboard").debugDescription.prefix(24_000)))
            }
        }
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.staticTexts["The Living Portal"].waitForExistence(timeout: 15))
        XCUIDevice.shared.press(.home)
        let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let icon = home.icons["World Explorer 3D"]
        XCTAssertTrue(icon.waitForExistence(timeout: 10)); icon.press(forDuration: 1.5)
        let editHome = home.buttons["Edit Home Screen"]
        XCTAssertTrue(editHome.waitForExistence(timeout: 5)); editHome.tap()
        let edit = home.buttons["Edit"]
        XCTAssertTrue(edit.waitForExistence(timeout: 5)); edit.tap()
        let add = home.buttons["Add Widget"]
        XCTAssertTrue(add.waitForExistence(timeout: 5)); add.tap()
        let search = home.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("World Explorer"); search.typeText("\n")
        capture("portal-widget-gallery-search")
        let collection = home.staticTexts["World Explorer 3D"].firstMatch
        XCTAssertTrue(collection.waitForExistence(timeout: 5))
        if collection.isHittable { collection.tap() }
        else {
            // iOS 26's remote gallery exposes this visible row but its text
            // reports no accessibility hit point. Use its verified on-screen
            // bounds, then require the actual gallery to open below.
            let bounds = collection.frame, keyboard = home.keyboards.firstMatch
            XCTAssertEqual(search.value as? String, "World Explorer")
            XCTAssertTrue(home.frame.contains(bounds)); XCTAssertGreaterThan(bounds.width, 40)
            XCTAssertGreaterThan(bounds.minY, search.frame.maxY)
            if keyboard.exists, keyboard.frame.height > 0, home.frame.intersects(keyboard.frame) { XCTAssertLessThan(bounds.maxY, keyboard.frame.minY) }
            home.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: bounds.midX, dy: bounds.midY)).tap()
        }
        capture("portal-widget-gallery")
        try tapVisibleText("Add Widget", in: home, lowerPart: true)
        let done = home.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 5)); done.tap()
        let wasSaved = try visibleText("Saved", timeout: 2) != nil
        if wasSaved { try tapVisibleText("Saved", in: home) }
        try tapVisibleText("Save", in: home)
        XCTAssertNotNil(try visibleText("Saved")); capture("portal-widget-home-saved")
        try tapVisibleText("Open place", in: home)
        XCTAssertTrue(app.buttons["Remove from saved places"].waitForExistence(timeout: 10))
        capture("portal-widget-open-native-place")
        // Keep this journey independent of the learning/rotation test's order.
        if !wasSaved { app.buttons["Remove from saved places"].tap(); XCTAssertTrue(app.buttons["Save place"].waitForExistence(timeout: 5)) }
    }
}
