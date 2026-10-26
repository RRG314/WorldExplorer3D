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
    func testHomeScreenWidget() throws {
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
        XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("World Explorer")
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
            if keyboard.exists { XCTAssertLessThan(bounds.maxY, keyboard.frame.minY) }
            home.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: bounds.midX, dy: bounds.midY)).tap()
        }
        XCTAssertTrue(add.waitForExistence(timeout: 10))
        capture("portal-widget-gallery")
        XCTAssertTrue(add.waitForExistence(timeout: 5)); add.tap()
        let done = home.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 5)); done.tap()
        let save = home.buttons["Save"], saved = home.buttons["Saved"]
        let wasSaved = saved.waitForExistence(timeout: 4)
        if wasSaved { saved.tap() }
        XCTAssertTrue(save.waitForExistence(timeout: 15)); save.tap()
        XCTAssertTrue(saved.waitForExistence(timeout: 15)); capture("portal-widget-home-saved")
        let open = home.links["Open place"].exists ? home.links["Open place"] : home.buttons["Open place"]
        XCTAssertTrue(open.waitForExistence(timeout: 5)); open.tap()
        XCTAssertTrue(app.buttons["Remove from saved places"].waitForExistence(timeout: 10))
        capture("portal-widget-open-native-place")
        // Keep this journey independent of the learning/rotation test's order.
        if !wasSaved { app.buttons["Remove from saved places"].tap(); XCTAssertTrue(app.buttons["Save place"].waitForExistence(timeout: 5)) }
    }
}
