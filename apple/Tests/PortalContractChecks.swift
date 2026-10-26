import Foundation
import Dispatch
#if canImport(WorldExplorerPortal)
@testable import WorldExplorerPortal
#endif

enum PortalContractChecks {
    struct Scenario: Decodable {
        var kind: String
        var before: PortalTrailEntry
        var command: PortalAction?
        var response: PortalSyncReceipt?
        var expected: PortalTrailEntry
        var view: PortalTrailState
    }
    struct Fixture: Decodable { var scenarios: [Scenario] }
    static func check(_ condition: Bool, _ message: String) throws {
        if !condition { throw PortalError.invalid(message) }
    }
    static func run(fixtures: URL, catalog: URL, directory: URL) throws -> Int {
        var count = 0
        let examples = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: fixtures))
        for scenario in examples.scenarios {
            var entry = scenario.before
            if scenario.kind == "queue" { try entry.queue(scenario.command!) }
            else { try entry.accept(scenario.response!, expectedOwner: entry.ownerScope) }
            try check(entry == scenario.expected, "Apple entry diverged from shared JS wire model.")
            let view = try entry.view(); try check(view == scenario.view, "Apple view diverged from shared JS wire model.")
            // Compare actual serialized JSON, including explicit null and the
            // encoded account key; synthesized Swift defaults cannot mask it.
            let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(entry)) as! NSDictionary
            let expected = try JSONSerialization.jsonObject(with: JSONEncoder().encode(scenario.expected)) as! NSDictionary
            try check(encoded == expected, "Apple serialized wire record changed."); count += 1
        }
        let store = try PortalStore(directory: directory, catalogURL: catalog), places = try store.catalog()
        let id = "baltimore-harbor", learning = places.place(id)!.learning.version
        try store.act(destination: id, kind: .save, expectedOwner: PortalContract.guest)
        try store.act(destination: id, kind: .investigate, expectedOwner: PortalContract.guest, learningVersion: learning)
        let guestKey = try PortalContract.key(owner: PortalContract.guest, destination: id)
        let reopened = try PortalStore(directory: directory, catalogURL: catalog).snapshot().entries[guestKey]!.view()
        try check(reopened.saved && reopened.investigatedAt > 0 && reopened.visitedAt == 0 && reopened.expeditionIds.isEmpty, "Offline native choices changed visit/reward semantics."); count += 1
        try store.adoptOwner("apple-fixture"); let owner = "account:apple-fixture"
        try store.copyDeviceChoices(expectedOwner: owner)
        let key = try PortalContract.key(owner: owner, destination: id)
        let copied = try store.snapshot().entries[key]!.view()
        try check(copied.saved && copied.investigatedAt > 0 && copied.visitedAt == 0, "Explicit device copy lost choices or copied a visit."); count += 1
        let sent = try store.snapshot().entries[key]!.pending["saved"]!
        try store.act(destination: id, kind: .unsave, expectedOwner: owner)
        var remote = PortalTrailState(destinationId: id); remote.revision = 3; remote.saved = true; remote.savedAt = 100; remote.firstOfferedAt = 100; remote.lastOfferedAt = 300; remote.visitedAt = 200
        try store.accept(PortalSyncReceipt(ownerScope: owner, operationId: sent.operationId, state: remote), expectedOwner: owner, current: { true })
        let merged = try store.snapshot().entries[key]!.view()
        try check(!merged.saved && merged.visitedAt == 200 && store.snapshot().entries[key]!.pending["saved"] != nil, "Late remote acknowledgement lost a newer tap or confirmed visit."); count += 1
        try check(!store.finishSync(expectedOwner: owner, current: { true }) && store.snapshot().syncedAt[owner] == nil, "A newer pending choice was reported fully synced.")
        try store.adoptOwner("other-apple-fixture")
        var denied = false
        do { try store.accept(PortalSyncReceipt(ownerScope: owner, operationId: nil, state: remote), expectedOwner: owner, current: { true }) } catch { denied = true }
        try check(denied, "Replaced owner accepted a late response."); count += 1
        try store.adoptOwner(nil); denied = false
        do { try store.act(destination: id, kind: .investigate, expectedOwner: PortalContract.guest, learningVersion: "old-version") } catch { denied = true }
        try check(denied, "Outdated facts marked new content as investigated."); count += 1
        let pageKey = "wander:default"
        let monaco = places.place("monaco-coast")!
        try store.investigate(key: pageKey, destination: monaco.id, expectedOwner: PortalContract.guest, version: monaco.learning.version, shownPage: -1)
        try store.investigate(key: pageKey, destination: monaco.id, expectedOwner: PortalContract.guest, version: monaco.learning.version, shownPage: 0)
        denied = false
        do { try store.investigate(key: pageKey, destination: monaco.id, expectedOwner: PortalContract.guest, version: monaco.learning.version, shownPage: 0) } catch { denied = true }
        try check(denied && store.snapshot().learning[pageKey]?.index == 1, "An old widget command advanced a fact that had not been shown."); count += 1
        for index in 1..<monaco.facts.count {
            try store.investigate(key: pageKey, destination: monaco.id, expectedOwner: PortalContract.guest, version: monaco.learning.version, shownPage: index)
        }
        let monacoKey = try PortalContract.key(owner: PortalContract.guest, destination: "monaco-coast")
        let learned = try store.snapshot().entries[monacoKey]!.view()
        try check(learned.investigatedAt > 0 && learned.visitedAt == 0 && store.snapshot().learning[pageKey] == nil, "Widget page sequence did not complete independently."); count += 1
        let loaded = try store.snapshot().catalogLoadedAt; denied = false
        do { try store.acceptCatalog(Data(contentsOf: catalog), current: { false }) } catch { denied = true }
        try check(denied && store.snapshot().catalogLoadedAt == loaded, "Cancelled catalog refresh published late."); count += 1
        final class Failures: @unchecked Sendable {
            private let lock = NSLock(); private var failed = false
            func mark() { lock.lock(); failed = true; lock.unlock() }
            func value() -> Bool { lock.lock(); defer { lock.unlock() }; return failed }
        }
        let failures = Failures()
        DispatchQueue.concurrentPerform(iterations: 40) { _ in
            do { let independent = try PortalStore(directory: directory, catalogURL: catalog); try independent.change { $0.syncedAt["contention"] = ($0.syncedAt["contention"] ?? 0) + 1 } }
            catch { failures.mark() }
        }
        try check(!failures.value() && store.snapshot().syncedAt["contention"] == 40, "Shared file lock lost concurrent updates."); count += 1
        try check(!places.gameAvailable(places.place(id)!, now: PortalContract.milliseconds()), "Unqualified collection offered a game visit."); count += 1
        return count
    }
}
