import XCTest
@testable import WorldExplorerPortal

final class PortalNativeTests: XCTestCase {
    func testSharedModelAndDurableStore() throws {
        let bundle = Bundle(for: Self.self)
        let fixtures = try XCTUnwrap(bundle.url(forResource: "portal-trail-contracts", withExtension: "json"))
        let catalog = try XCTUnwrap(Bundle.main.url(forResource: "portal-catalog", withExtension: "json"))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("we3d-owned-tests-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        XCTAssertEqual(try PortalContractChecks.run(fixtures: fixtures, catalog: catalog, directory: directory), 16)
    }

    func testPrivateConnectionProofAndStaleGeneration() throws {
        let storage = PortalPrivateProof()
        XCTAssertNil(try storage.read(), "The owned fresh simulator must not contain an existing connection.")
        let proof = PortalConnectionProof(requestId: try PortalConnectionProof.random(), verifier: try PortalConnectionProof.random(), verificationCode: "12345678", expiresAt: PortalContract.milliseconds() + 60_000)
        defer { try? storage.clear() }
        try storage.write(proof)
        XCTAssertEqual(try storage.read()?.verifier, proof.verifier)
        XCTAssertEqual(PortalConnectionProof.challenge(proof.verifier).utf8.count, 43)
        XCTAssertFalse(PortalConnectionProof.opaque(proof.requestId + "\n"))
        let generation = PortalGeneration(), old = generation.next()
        XCTAssertTrue(generation.current(old)); _ = generation.next(); XCTAssertFalse(generation.current(old))
        try storage.clear(); XCTAssertNil(try storage.read())
    }

    func testAppGroupIsActuallyAvailable() throws {
        let store = try PortalStore(), document = try store.snapshot()
        XCTAssertEqual(document.ownerScope, PortalContract.guest)
        XCTAssertFalse(document.accountCommitPending)
        XCTAssertEqual(PortalContract.callbackScheme, Bundle.main.bundleIdentifier)
    }
}
