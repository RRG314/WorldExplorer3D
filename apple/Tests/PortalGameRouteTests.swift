import XCTest
@testable import WorldExplorerPortal

final class PortalGameRouteTests: XCTestCase {
    func testGameRouteRetainsDestinationAndMarksStoreEdition() throws {
        let destination = try XCTUnwrap(PortalGameDestination(path: "/app/?launch=moon&gm=free&distribution=web#start"))
        let parts = try XCTUnwrap(URLComponents(url: destination.url, resolvingAgainstBaseURL: false))
        XCTAssertEqual(parts.host, PortalContract.origin.host)
        XCTAssertEqual(parts.fragment, "start")
        XCTAssertEqual(parts.queryItems?.filter { $0.name == "distribution" }.map(\.value), ["app-store"])
        XCTAssertEqual(parts.queryItems?.first { $0.name == "launch" }?.value, "moon")
    }
    func testGameRouteRejectsExternalCredentialAndNonGameTargets() {
        for route in ["https://other.example/app/", "http://worldexplorer3d.io/app/", "/account/", "//other.example/app/", "https://user:secret@worldexplorer3d.io/app/", "https://worldexplorer3d.io:444/app/"] {
            XCTAssertNil(PortalGameDestination(path: route), route)
        }
    }
}
