import Foundation
import Darwin

struct PortalLearningPage: Codable, Sendable {
    var destinationId: String
    var contentVersion: String
    var index: Int
}

struct PortalDocument: Codable, Sendable {
    var schemaVersion = 1
    var ownerScope = PortalContract.guest
    var accountCommitPending = false
    var entries: [String: PortalTrailEntry] = [:]
    var catalog: PortalCatalog?
    var catalogLoadedAt: Int64 = 0
    var syncedAt: [String: Int64] = [:]
    var learning: [String: PortalLearningPage] = [:]
}

/// App and WidgetKit are separate processes. Every read/change uses the same
/// stable file lock; atomic replacement never replaces that lock's inode.
/// The shared document holds presentation/Trail data, never SDK credentials.
final class PortalStore: @unchecked Sendable {
    private let directory: URL
    private let file: URL
    private let lockFile: URL
    private let fallback: URL

    init(directory: URL? = nil, bundle: Bundle = .main, catalogURL: URL? = nil) throws {
        guard let root = directory ?? FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: PortalContract.appGroup),
              let fallback = catalogURL ?? bundle.url(forResource: "portal-catalog", withExtension: "json") else {
            throw PortalError.invalid("The shared Portal could not open. Reopen World Explorer and try again.")
        }
        self.directory = root.appendingPathComponent("Library/Application Support/LivingPortal", isDirectory: true)
        file = self.directory.appendingPathComponent("trail-v1.json")
        lockFile = self.directory.appendingPathComponent("trail-v1.lock")
        self.fallback = fallback
        try FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
    }
    private func locked<T>(_ action: () throws -> T) throws -> T {
        let descriptor = Darwin.open(lockFile.path, O_CREAT | O_RDWR | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw PortalError.invalid("Your Trail is temporarily unavailable.") }
        defer { Darwin.close(descriptor) }
        while flock(descriptor, LOCK_EX) != 0 {
            if errno != EINTR { throw PortalError.invalid("Your Trail is temporarily unavailable.") }
        }
        defer { flock(descriptor, LOCK_UN) }
        return try action()
    }
    private func load() throws -> PortalDocument {
        guard FileManager.default.fileExists(atPath: file.path) else { return PortalDocument() }
        let data = try Data(contentsOf: file)
        guard data.count <= 4 * 1024 * 1024 else { throw PortalError.invalid("This Trail is too large to open in the widget.") }
        let document = try JSONDecoder().decode(PortalDocument.self, from: data)
        guard document.schemaVersion == 1, PortalContract.owner(document.ownerScope), document.entries.count <= 10_000 else { throw PortalError.invalid("Unsupported Portal data. Your saved file is kept.") }
        for (key, entry) in document.entries {
            try entry.validate()
            guard key == entry.id else { throw PortalError.invalid("Invalid Trail identity. Your saved file is kept.") }
        }
        return document
    }
    private func save(_ document: PortalDocument) throws {
        let data = try JSONEncoder().encode(document)
        guard data.count <= 4 * 1024 * 1024 else { throw PortalError.invalid("This Trail is too large to save. Your existing file is kept.") }
        #if os(iOS)
        try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: file, options: .atomic)
        #endif
    }
    func snapshot() throws -> PortalDocument { try locked { try load() } }
    @discardableResult
    func change<T>(_ action: (inout PortalDocument) throws -> T) throws -> T {
        try locked { var document = try load(); let result = try action(&document); try save(document); return result }
    }
    func catalog(in document: PortalDocument? = nil) throws -> PortalCatalog {
        if let cached = document?.catalog { try cached.validate(); return cached }
        if document == nil, let cached = try snapshot().catalog { try cached.validate(); return cached }
        let data = try Data(contentsOf: fallback)
        guard data.count <= 131_072 else { throw PortalError.invalid("The Portal collection is too large.") }
        let catalog = try JSONDecoder().decode(PortalCatalog.self, from: data); try catalog.validate(); return catalog
    }
    func acceptCatalog(_ data: Data, current: () -> Bool = { true }) throws {
        guard data.count <= 131_072 else { throw PortalError.invalid("The Portal collection is too large.") }
        let catalog = try JSONDecoder().decode(PortalCatalog.self, from: data); try catalog.validate()
        try change { document in
            guard current() else { throw CancellationError() }
            document.catalog = catalog; document.catalogLoadedAt = PortalContract.milliseconds()
        }
    }
    func act(destination: String, kind: PortalAction.Kind, expectedOwner: String, learningVersion: String? = nil) throws {
        try change { document in
            guard document.ownerScope == expectedOwner else { throw PortalError.invalid("Explorer account changed. Reopen your Trail.") }
            guard let place = try catalog(in: document).place(destination) else { throw PortalError.invalid("This place is no longer in the collection.") }
            if kind == .investigate && learningVersion != place.learning.version { throw PortalError.invalid("This investigation changed. Reopen it before marking it complete.") }
            let key = try PortalContract.key(owner: expectedOwner, destination: destination)
            var entry = try document.entries[key] ?? PortalTrailEntry(owner: expectedOwner, destination: destination)
            let now = PortalContract.milliseconds()
            if kind == .offered {
                let previous = try entry.view()
                if previous.lastOfferedAt / 86_400_000 == now / 86_400_000 { return }
            }
            try entry.queue(PortalAction(operationId: UUID().uuidString.lowercased(), destinationId: destination, kind: kind, createdAt: now, contentVersion: kind == .investigate ? place.learning.version : nil))
            document.entries[key] = entry
        }
    }
    func accept(_ receipt: PortalSyncReceipt, expectedOwner: String, current: () -> Bool) throws {
        try change { document in
            guard current(), document.ownerScope == expectedOwner, !document.accountCommitPending else { throw CancellationError() }
            let key = try PortalContract.key(owner: expectedOwner, destination: receipt.state.destinationId)
            var entry = try document.entries[key] ?? PortalTrailEntry(owner: expectedOwner, destination: receipt.state.destinationId)
            try entry.accept(receipt, expectedOwner: expectedOwner); document.entries[key] = entry
        }
    }
    func adoptOwner(_ uid: String?) throws {
        let scope = uid.map { "account:" + $0 } ?? PortalContract.guest
        guard PortalContract.owner(scope) else { throw PortalError.invalid("Invalid Explorer account.") }
        try change { $0.ownerScope = scope; $0.accountCommitPending = false; $0.learning = [:] }
    }
    func finishSync(expectedOwner: String, current: () -> Bool) throws -> Bool {
        try change { document in
            guard current(), document.ownerScope == expectedOwner, !document.accountCommitPending else { throw CancellationError() }
            guard !document.entries.values.contains(where: { $0.ownerScope == expectedOwner && !$0.pending.isEmpty }) else { return false }
            document.syncedAt[expectedOwner] = PortalContract.milliseconds(); return true
        }
    }
    func copyDeviceChoices(expectedOwner: String) throws {
        try change { document in
            guard document.ownerScope == expectedOwner, expectedOwner != PortalContract.guest else { throw PortalError.invalid("Explorer account changed. Reopen your Trail.") }
            let collection = try catalog(in: document)
            for guest in document.entries.values.filter({ $0.ownerScope == PortalContract.guest }) {
                let view = try guest.view()
                guard let place = collection.place(guest.destinationId) else { continue }
                let key = try PortalContract.key(owner: expectedOwner, destination: guest.destinationId)
                var entry = try document.entries[key] ?? PortalTrailEntry(owner: expectedOwner, destination: guest.destinationId)
                for kind: PortalAction.Kind in [.save, .investigate] {
                    if kind == .save && !view.saved { continue }
                    if kind == .investigate && (view.investigatedAt == 0 || view.investigationVersion != place.learning.version) { continue }
                    try entry.queue(PortalAction(operationId: UUID().uuidString.lowercased(), destinationId: guest.destinationId, kind: kind, createdAt: PortalContract.milliseconds(), contentVersion: kind == .investigate ? place.learning.version : nil))
                }
                document.entries[key] = entry
            }
        }
    }
    func investigate(key: String, destination: String, expectedOwner: String, version: String, shownPage: Int) throws {
        try change { document in
            guard document.ownerScope == expectedOwner, let place = try catalog(in: document).place(destination), version == place.learning.version else { throw PortalError.invalid("This account or investigation changed. Reopen the widget.") }
            let previous = document.learning[key]
            if shownPage == -1 {
                document.learning[key] = PortalLearningPage(destinationId: destination, contentVersion: version, index: 0); return
            }
            guard shownPage >= 0, previous?.destinationId == destination, previous?.contentVersion == version,
                  previous?.index == shownPage else { throw PortalError.invalid("This fact page changed. Wait for the widget to refresh.") }
            let index = shownPage
            if index < place.facts.count - 1 { document.learning[key]?.index = index + 1; return }
            let trailKey = try PortalContract.key(owner: expectedOwner, destination: destination)
            var entry = try document.entries[trailKey] ?? PortalTrailEntry(owner: expectedOwner, destination: destination)
            try entry.queue(PortalAction(operationId: UUID().uuidString.lowercased(), destinationId: destination, kind: .investigate, createdAt: PortalContract.milliseconds(), contentVersion: version))
            document.entries[trailKey] = entry; document.learning.removeValue(forKey: key)
        }
    }
}
