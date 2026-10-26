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
        try homeScreenWidget(app)
    }
    private func homeScreenWidget(_ app: XCUIApplication) throws {
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
        XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("World Explorer")
        capture("portal-widget-gallery-search")
        let collection = home.staticTexts["World Explorer 3D"].firstMatch
        XCTAssertTrue(collection.waitForExistence(timeout: 5)); collection.tap()
        capture("portal-widget-gallery")
        XCTAssertTrue(add.waitForExistence(timeout: 5)); add.tap()
        let done = home.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 5)); done.tap()
        let save = home.buttons["Save"], saved = home.buttons["Saved"]
        // A previously saved place must still project into the OS widget. Toggle
        // it back to saved so the same journey preserves its final choice.
        if saved.waitForExistence(timeout: 4) { saved.tap() }
        XCTAssertTrue(save.waitForExistence(timeout: 15)); save.tap()
        XCTAssertTrue(saved.waitForExistence(timeout: 15)); capture("portal-widget-home-saved")
        let open = home.links["Open place"].exists ? home.links["Open place"] : home.buttons["Open place"]
        XCTAssertTrue(open.waitForExistence(timeout: 5)); open.tap()
        XCTAssertTrue(app.buttons["Remove from saved places"].waitForExistence(timeout: 10))
        capture("portal-widget-open-native-place")
    }
}
