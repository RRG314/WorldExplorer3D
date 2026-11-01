#if DEBUG && WE3D_STAGING && targetEnvironment(simulator)
import XCTest
import UIKit
@preconcurrency import FirebaseCore
@preconcurrency import FirebaseAuth
@testable import WorldExplorerPortal

@MainActor final class PortalNativeLiveTests: XCTestCase {
    private final class RejectRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    }
    private var browserIdentity = ""
    private func freshBrowserIdentity(_ fixture: PortalNativeAcceptance) async throws {
        guard fixture.browserEmail.hasPrefix("qa-native-"), fixture.browserEmail.hasSuffix("@example.invalid") else { throw PortalError.invalid("Use only the disposable verification account.") }
        var components = URLComponents(string: "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")!
        components.queryItems = [URLQueryItem(name: "key", value: fixture.browserApiKey)]
        var request = URLRequest(url: try XCTUnwrap(components.url))
        request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["email": fixture.browserEmail, "password": fixture.browserPassword, "returnSecureToken": true])
        struct Identity: Decodable { var localId: String; var idToken: String }
        // This controlled Google sign-in role belongs only to the simulator
        // test. Do not widen the product Portal network origin allowlist.
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false; config.urlCache = nil; config.timeoutIntervalForResource = 15
        let session = URLSession(configuration: config, delegate: RejectRedirects(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200, response.expectedContentLength <= 16_384 else { throw PortalError.invalid("The disposable browser account could not sign in.") }
        var data = Data()
        for try await byte in bytes { guard data.count < 16_384 else { throw PortalError.invalid("Invalid verification response.") }; data.append(byte) }
        let signed = try JSONDecoder().decode(Identity.self, from: data)
        guard signed.localId == fixture.uid, !signed.idToken.isEmpty else { throw PortalError.invalid("The disposable browser identity changed.") }
        browserIdentity = signed.idToken
    }
    private func until(_ condition: () -> Bool, _ message: String) async throws {
        let deadline = Date().addingTimeInterval(90)
        while !condition() { if Date() > deadline { throw PortalError.invalid(message) }; try await Task.sleep(for: .milliseconds(100)) }
    }
    private func browser<T: Decodable>(_ name: String, _ body: [String: Any], _ fixture: PortalNativeAcceptance, as: T.Type) async throws -> T {
        var request = URLRequest(url: PortalContract.apiOrigin.appendingPathComponent(name)), content = body
        content["expectedOwnerUid"] = fixture.uid
        request.httpMethod = "POST"; request.httpBody = try JSONSerialization.data(withJSONObject: content)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.setValue("Bearer " + browserIdentity, forHTTPHeaderField: "Authorization"); request.setValue(fixture.webCheck, forHTTPHeaderField: "X-Firebase-AppCheck")
        return try JSONDecoder().decode(T.self, from: await PortalNetwork.shared.data(request, limit: 262_144))
    }
    private struct Metadata: Decodable { var verificationCode: String }
    private struct Approval: Decodable { var callback: String }
    private struct Trail: Decodable { var ownerScope: String; var items: [PortalTrailState] }
    func testNativeAdoptionRefreshAndLiveTrail() async throws {
        guard let fixture = try PortalNativeAcceptance.load() else { throw XCTSkip("No owned temporary live identity was requested.") }
        let store = try PortalStore(), account = PortalAccount.shared(store: store), owner = "account:" + fixture.uid
        await account.bootstrap()
        XCTAssertEqual(try store.snapshot().ownerScope, PortalContract.guest)
        account.begin()
        try await until({ account.approvalURL != nil }, "The native app did not reach browser approval.")
        let url = try XCTUnwrap(account.approvalURL), requestId = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "connect" })?.value)
        try await freshBrowserIdentity(fixture)
        let metadata = try await browser("inspectPortalPairing", ["requestId": requestId], fixture, as: Metadata.self)
        XCTAssertEqual(metadata.verificationCode, account.verificationCode)
        let code = try PortalConnectionProof.random()
        let approval = try await browser("approvePortalPairing", ["requestId": requestId, "approvalId": UUID().uuidString, "codeHash": PortalConnectionProof.challenge(code)], fixture, as: Approval.self)
        XCTAssertEqual(approval.callback, PortalContract.callbackScheme + "://portal-connect")
        var callback = try XCTUnwrap(URLComponents(string: approval.callback)); callback.queryItems = [URLQueryItem(name: "requestId", value: requestId), URLQueryItem(name: "code", value: code)]
        let dispatched = await UIApplication.shared.open(try XCTUnwrap(callback.url)); XCTAssertTrue(dispatched)
        try await until({ (try? store.snapshot().ownerScope) == owner && account.phase == "synced" }, "The native OS callback did not adopt and sync the approved account.")
        try await until({ FirebaseApp.app(name: "portal-candidate") == nil }, "Candidate SDK session did not retire.")
        let primary = try XCTUnwrap(FirebaseApp.app(name: "portal-native")), user = try XCTUnwrap(Auth.auth(app: primary).currentUser)
        XCTAssertEqual(user.uid, fixture.uid)
        // Actual refresh after candidate teardown detects the Apple SDK's weak
        // Auth association issue; a custom-token REST call cannot establish it.
        let refreshed = try await user.getIDToken(forcingRefresh: true); XCTAssertFalse(refreshed.isEmpty)
        try store.act(destination: "baltimore-harbor", kind: .save, expectedOwner: owner)
        await account.synchronize(); XCTAssertEqual(account.phase, "synced")
        let trail = try await browser("listPortalTrail", ["after": NSNull(), "limit": 100], fixture, as: Trail.self)
        XCTAssertEqual(trail.ownerScope, owner); XCTAssertEqual(trail.items.count, 1); XCTAssertTrue(trail.items[0].saved); XCTAssertEqual(trail.items[0].visitedAt, 0)
        account.disconnect(displayedOwner: owner); await account.bootstrap()
        XCTAssertNil(Auth.auth(app: primary).currentUser); XCTAssertEqual(try store.snapshot().ownerScope, PortalContract.guest)
        try store.change { document in document.entries = document.entries.filter { $0.value.ownerScope != owner }; document.syncedAt.removeValue(forKey: owner) }
    }
}
#endif
