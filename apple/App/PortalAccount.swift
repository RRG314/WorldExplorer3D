import Foundation
import SwiftUI
import WidgetKit
@preconcurrency import FirebaseCore
@preconcurrency import FirebaseAuth
@preconcurrency import FirebaseAppCheck

private final class PortalAttestFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> (any AppCheckProvider)? { AppAttestProvider(app: app) }
}

/// Native account commands serialize SDK mutations and drain them before the
/// next command. Generations revoke publication, not an SDK task mid-adoption.
@MainActor final class PortalAccount: ObservableObject {
    private static var instance: PortalAccount?
    static func shared(store: PortalStore) -> PortalAccount {
        if let instance { return instance }
        let owner = PortalAccount(store: store); instance = owner; return owner
    }
    @Published private(set) var phase = "device"
    @Published private(set) var message = ""
    @Published private(set) var verificationCode = ""
    @Published private(set) var approvalURL: URL?
    private let store: PortalStore
    private let proofStore = PortalPrivateProof()
    private let generation = PortalGeneration()
    private var pending: PortalConnectionProof?
    private var firebase: FirebaseApp?
    private var auth: Auth?
    private var check: AppCheck?
    private var opened = false
    private var initialListener: AuthStateDidChangeListenerHandle?
    private var commands: Task<Void, Never>?

    private init(store: PortalStore) { self.store = store }
    var accountLabel: String {
        guard let user = auth?.currentUser, let document = try? store.snapshot(), document.ownerScope == "account:" + user.uid else { return "" }
        return user.email ?? "Explorer account"
    }
    var version: UInt64 { generation.capture() }
    @discardableResult private func enqueue(_ action: @escaping @MainActor () async -> Void) -> Task<Void, Never> {
        let previous = commands
        let next = Task { @MainActor in await previous?.value; await action() }
        commands = next; return next
    }
    private func failure(_ error: Error) {
        phase = "pending"; message = (error as? PortalError)?.localizedDescription ?? "Connection is unavailable. Your saved choices are kept. Try again when connected."
    }
    private func sdk(_ name: String) throws -> FirebaseApp {
        if let app = FirebaseApp.app(name: name) { return app }
        #if DEBUG && WE3D_STAGING && targetEnvironment(simulator)
        AppCheck.setAppCheckProviderFactory(try PortalDebugAttestation.factory() ?? AppCheckDebugProviderFactory())
        #elseif DEBUG && WE3D_STAGING
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        #else
        AppCheck.setAppCheckProviderFactory(PortalAttestFactory())
        #endif
        #if WE3D_STAGING
        let resource = "FirebaseStaging"
        #else
        let resource = "FirebaseProduction"
        #endif
        guard let path = Bundle.main.path(forResource: resource, ofType: "plist"), let options = FirebaseOptions(contentsOfFile: path), options.bundleID == Bundle.main.bundleIdentifier else { throw PortalError.invalid("This app's secure connection is unavailable.") }
        FirebaseApp.configure(name: name, options: options)
        guard let app = FirebaseApp.app(name: name) else { throw PortalError.invalid("The account service could not open.") }
        app.isDataCollectionDefaultEnabled = false
        guard let attestation = AppCheck.appCheck(app: app) else { throw PortalError.invalid("This device's secure connection could not open.") }
        attestation.isTokenAutoRefreshEnabled = false
        return app
    }
    private func open() async throws {
        if opened { return }
        let app = try sdk("portal-native"), identity = Auth.auth(app: app)
        firebase = app; auth = identity; check = AppCheck.appCheck(app: app)
        // The first listener fires after the SDK has loaded its private user.
        // Do not mistake a not-yet-loaded keychain session for a signed-out user.
        let user: User? = await withCheckedContinuation { continuation in
            initialListener = identity.addStateDidChangeListener { [weak self] _, user in
                Task { @MainActor in
                    guard let self, let listener = self.initialListener else { return }
                    identity.removeStateDidChangeListener(listener); self.initialListener = nil; continuation.resume(returning: user)
                }
            }
        }
        let document = try store.snapshot(), expected = user.map { "account:" + $0.uid } ?? PortalContract.guest
        if document.accountCommitPending || document.ownerScope != expected {
            try identity.signOut(); try store.adoptOwner(nil); message = "Reconnect your Explorer account. Your saved Trails are kept."
        }
        let abandoned = try sdk("portal-candidate"); try? Auth.auth(app: abandoned).signOut(); _ = await abandoned.delete()
        if let proof = try proofStore.read(), proof.expiresAt > PortalContract.milliseconds() {
            do { try proof.validate(); pending = proof; present(proof) }
            catch { try proofStore.clear(); message = "Start a new device connection." }
        } else { try proofStore.clear() }
        opened = true; phase = pending == nil ? (identity.currentUser == nil ? "device" : "pending") : "approval"
    }
    private func present(_ proof: PortalConnectionProof?) {
        verificationCode = proof?.verificationCode ?? ""
        approvalURL = proof.map { URL(string: "/portal/?connect=" + PortalContract.component($0.requestId), relativeTo: PortalContract.origin)!.absoluteURL }
    }
    func bootstrap() async { let task = enqueue { [self] in do { try await open() } catch { failure(error) } }; await task.value }
    private func post<T: Decodable>(_ endpoint: String, body: [String: Any], uid: String? = nil, version: UInt64?, allowed: @Sendable () -> Bool = { true }, as: T.Type) async throws -> T {
        guard let check, let auth else { throw PortalError.invalid("The account service is not ready.") }
        guard allowed(), version.map(generation.current) ?? true else { throw CancellationError() }
        let attestation = try await check.token(forcingRefresh: false)
        guard allowed(), version.map(generation.current) ?? true else { throw CancellationError() }
        var request = URLRequest(url: PortalContract.apiOrigin.appendingPathComponent(endpoint))
        request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(attestation.token, forHTTPHeaderField: "X-Firebase-AppCheck")
        var content = body
        if let uid {
            guard let user = auth.currentUser, user.uid == uid else { throw PortalError.invalid("Explorer account changed. Reconnect your Portal.") }
            request.setValue("Bearer " + (try await user.getIDToken()), forHTTPHeaderField: "Authorization")
            content["expectedOwnerUid"] = uid
        }
        guard allowed(), version.map(generation.current) ?? true else { throw CancellationError() }
        request.httpBody = try JSONSerialization.data(withJSONObject: content)
        let response = try await PortalNetwork.shared.data(request, limit: 262_144)
        guard allowed(), version.map(generation.current) ?? true else { throw CancellationError() }
        if let uid, auth.currentUser?.uid != uid { throw PortalError.invalid("Explorer account changed. Reopen your Trail.") }
        return try JSONDecoder().decode(T.self, from: response)
    }
    private struct Started: Decodable { var requestId: String; var verificationCode: String; var expiresAt: Int64 }
    private struct Claimed: Decodable { var ownerUid: String; var customToken: String }
    private struct Cancelled: Decodable { var cancelled: Bool }
    private func cancelRemote(_ proof: PortalConnectionProof) async {
        _ = try? await post("cancelPortalPairing", body: ["requestId": proof.requestId, "verifier": proof.verifier], version: nil, as: Cancelled.self)
    }
    func begin() {
        let version = generation.next()
        enqueue { [self] in
            var created: PortalConnectionProof?
            do {
                try await open(); guard generation.current(version) else { return }
                if let old = pending { pending = nil; present(nil); try proofStore.clear(); await cancelRemote(old) }
                guard generation.current(version) else { return }; phase = "connecting"; message = "Preparing your secure device connection…"
                let verifier = try PortalConnectionProof.random()
                let response = try await post("startPortalPairing", body: ["challenge": PortalConnectionProof.challenge(verifier)], version: version, as: Started.self)
                let proof = PortalConnectionProof(requestId: response.requestId, verifier: verifier, verificationCode: response.verificationCode, expiresAt: response.expiresAt)
                created = proof; try proof.validate()
                guard generation.current(version) else { await cancelRemote(proof); return }
                try proofStore.write(proof); pending = proof; present(proof); phase = "approval"; message = "Open your browser, sign in and check that the code matches."
            } catch {
                if generation.current(version) { failure(error) }
                if let created { await cancelRemote(created) }
            }
        }
    }
    func cancel(displayedVersion: UInt64? = nil) {
        if let displayedVersion, !generation.current(displayedVersion) { return }
        _ = generation.next(); let old = pending; pending = nil; present(nil)
        do { try proofStore.clear(); message = "Device connection cancelled." } catch { failure(error) }
        phase = "device"; enqueue { [self] in if let old { await cancelRemote(old) } }
    }
    static func callback(_ url: URL) -> (String, String)? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false), parts.scheme == PortalContract.callbackScheme, parts.host == "portal-connect", parts.user == nil, parts.password == nil, parts.port == nil, parts.path.isEmpty, parts.fragment == nil,
              let items = parts.queryItems, items.count == 2,
              items.filter({ $0.name == "requestId" }).count == 1, items.filter({ $0.name == "code" }).count == 1,
              let id = items.first(where: { $0.name == "requestId" })?.value, let code = items.first(where: { $0.name == "code" })?.value,
              PortalConnectionProof.opaque(id), PortalConnectionProof.opaque(code) else { return nil }
        return (id, code)
    }
    func receive(_ url: URL) {
        guard let (id, code) = Self.callback(url) else { message = "This device connection link is invalid."; return }
        let version = generation.capture()
        enqueue { [self] in
            var candidate: FirebaseApp?
            var connected = false
            do {
                try await open(); guard generation.current(version), let proof = pending, proof.requestId == id else { throw PortalError.invalid("This connection expired or belongs to another device. Start again.") }
                try proof.validate(); phase = "connecting"; message = "Connecting your Explorer account…"
                let claim = try await post("claimPortalPairing", body: ["requestId": id, "code": code, "verifier": proof.verifier], version: version, as: Claimed.self)
                guard PortalContract.owner("account:" + claim.ownerUid), let auth else { throw PortalError.invalid("Invalid Explorer account response.") }
                let prepared = try sdk("portal-candidate"); candidate = prepared
                let verified = try await Auth.auth(app: prepared).signIn(withCustomToken: claim.customToken).user
                guard verified.uid == claim.ownerUid else { throw PortalError.invalid("The approved Explorer account did not match.") }
                guard generation.current(version) else { throw CancellationError() }
                let previous = auth.currentUser
                try store.change { $0.accountCommitPending = true }
                var accepted = false
                do {
                    // Apple SDK 13.1.1 updateCurrentUser retains the source
                    // User's weak Auth association. Sign into the primary SDK
                    // with the same private token so refresh ownership is real.
                    let adopted = try await auth.signIn(withCustomToken: claim.customToken).user
                    guard generation.current(version), adopted.uid == claim.ownerUid, auth.currentUser?.uid == claim.ownerUid else { throw CancellationError() }
                    try proofStore.clear(); pending = nil; present(nil); try store.adoptOwner(claim.ownerUid); accepted = true
                } catch {
                    do {
                        if let previous { try await auth.updateCurrentUser(previous) } else { try auth.signOut() }
                        if generation.current(version) { try store.adoptOwner(previous?.uid) } else { try store.change { $0.accountCommitPending = false } }
                    } catch { try? auth.signOut(); try? store.adoptOwner(nil) }
                    throw error
                }
                if accepted { connected = true; phase = "pending"; message = "Explorer account connected. Device choices stay separate until you choose to copy them."; WidgetCenter.shared.reloadAllTimelines() }
            } catch { if generation.current(version) { failure(error) } }
            if let candidate { try? Auth.auth(app: candidate).signOut(); _ = await candidate.delete() }
            if connected, generation.current(version) { do { try await syncNow(version: version) } catch { failure(error) } }
        }
    }
    func disconnect(displayedOwner: String) {
        guard (try? store.snapshot().ownerScope) == displayedOwner else { message = "Explorer account changed. Reopen the account screen."; return }
        cancel(); do { try store.adoptOwner(nil) } catch { failure(error); return }; WidgetCenter.shared.reloadAllTimelines()
        enqueue { [self] in do { try await open(); try auth?.signOut(); try store.adoptOwner(nil); phase = "device"; message = "Portal disconnected. Your account Trail is kept." } catch { failure(error) } }
    }
    func copyDeviceChoices(displayedOwner: String) {
        let version = generation.capture()
        enqueue { [self] in do { try await open(); guard generation.current(version) else { return }; try store.copyDeviceChoices(expectedOwner: displayedOwner); WidgetCenter.shared.reloadAllTimelines(); try await syncNow(version: version) } catch { if generation.current(version) { failure(error) } } }
    }
    func synchronize(allowed: @escaping @Sendable () -> Bool = { true }) async {
        let version = generation.capture()
        let task = enqueue { [self] in
            do { guard allowed() else { return }; try await open(); try await syncNow(version: version, allowed: allowed) }
            catch { if generation.current(version) {
                if allowed() { failure(error) }
                else if phase == "syncing" { phase = "pending"; message = "Your choices are saved. Sync will continue when connected." }
            } }
        }
        await task.value
    }
    private struct Page: Decodable { var ownerScope: String; var items: [PortalTrailState]; var nextCursor: String? }
    private func syncNow(version: UInt64, allowed: @Sendable () -> Bool = { true }) async throws {
        let owner = try store.snapshot().ownerScope
        guard owner != PortalContract.guest, generation.current(version), allowed(), !(try store.snapshot()).accountCommitPending else { return }
        let uid = String(owner.dropFirst(8)); phase = "syncing"; message = "Syncing your Exploration Trail…"
        for entry in try store.snapshot().entries.values.filter({ $0.ownerScope == owner }) {
            for action in entry.orderedPending {
                let wire = try JSONSerialization.jsonObject(with: JSONEncoder().encode(action))
                let reply = try await post("mutatePortalTrail", body: ["action": wire], uid: uid, version: version, allowed: allowed, as: PortalSyncReceipt.self)
                try store.accept(reply, expectedOwner: owner, current: { self.generation.current(version) && allowed() })
            }
        }
        var after: String?, seen = Set<String>(), count = 0
        repeat {
            let page = try await post("listPortalTrail", body: ["after": after as Any? ?? NSNull(), "limit": 100], uid: uid, version: version, allowed: allowed, as: Page.self)
            count += page.items.count
            guard page.ownerScope == owner, page.items.count <= 100, count <= 10_000 else { throw PortalError.invalid("Invalid Trail synchronization response.") }
            for state in page.items { try store.accept(PortalSyncReceipt(ownerScope: owner, operationId: nil, state: state), expectedOwner: owner, current: { self.generation.current(version) && allowed() }) }
            after = page.nextCursor
            if let cursor = after { guard PortalContract.identifier(cursor), seen.insert(cursor).inserted, !page.items.isEmpty else { throw PortalError.invalid("Invalid Trail page cursor.") } }
        } while after != nil
        guard generation.current(version), allowed() else { return }
        let complete = try store.finishSync(expectedOwner: owner, current: { self.generation.current(version) && allowed() })
        phase = complete ? "synced" : "pending"; message = complete ? "Your Trail is synced." : "New choices are saved. Sync will continue when connected."
        WidgetCenter.shared.reloadAllTimelines()
    }
}
