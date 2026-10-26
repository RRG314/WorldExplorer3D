import XCTest

@MainActor final class PortalUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    private func capture(_ name: String) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image)
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
}
