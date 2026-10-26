import Foundation

enum PortalError: LocalizedError {
    case invalid(String)
    var errorDescription: String? { switch self { case .invalid(let message): return message } }
}

enum PortalContract {
    #if WE3D_STAGING
    static let origin = URL(string: "https://we3d-staging-20260712.web.app")!
    static let apiOrigin = URL(string: "https://us-central1-we3d-staging-20260712.cloudfunctions.net")!
    static let appGroup = "group.io.worldexplorer3d.portal.staging"
    static let callbackScheme = "io.worldexplorer3d.app.staging"
    #else
    static let origin = URL(string: "https://worldexplorer3d.io")!
    static let apiOrigin = URL(string: "https://us-central1-worldexplorer3d-d9b83.cloudfunctions.net")!
    static let appGroup = "group.io.worldexplorer3d.portal"
    static let callbackScheme = "io.worldexplorer3d.app"
    #endif
    static let guest = "device-guest"
    static func identifier(_ value: String) -> Bool {
        guard let range = value.range(of: "^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$", options: .regularExpression) else { return false }
        return range.lowerBound == value.startIndex && range.upperBound == value.endIndex
    }
    static func owner(_ value: String) -> Bool {
        if value == guest { return true }
        guard value.hasPrefix("account:") else { return false }
        let uid = String(value.dropFirst(8))
        return (1...128).contains(uid.utf16.count) && !uid.unicodeScalars.contains { $0.value < 32 || $0.value == 127 }
    }
    static func timestamp(_ value: Int64) -> Bool { value >= 0 && value <= 9_007_199_254_740_991 }
    static func milliseconds() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
    static func component(_ value: String) -> String {
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")
        return value.addingPercentEncoding(withAllowedCharacters: allowed)!
    }
    static func key(owner: String, destination: String) throws -> String {
        guard self.owner(owner), identifier(destination) else { throw PortalError.invalid("Invalid Trail owner or destination.") }
        return "portal-trail:\(component(owner))|\(destination)"
    }
}

struct PortalAction: Codable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable { case offered, save, unsave, investigate }
    var operationId: String
    var destinationId: String
    var kind: Kind
    var createdAt: Int64
    var contentVersion: String?
    var slot: String {
        switch kind { case .save, .unsave: return "saved"; case .offered: return "offered"; case .investigate: return "investigated" }
    }
    func validate() throws {
        guard PortalContract.identifier(operationId), PortalContract.identifier(destinationId), PortalContract.timestamp(createdAt), createdAt > 0,
              kind != .investigate || contentVersion.map(PortalContract.identifier) == true else {
            throw PortalError.invalid("Invalid Portal choice.")
        }
    }
}

struct PortalTrailState: Codable, Equatable, Sendable {
    var destinationId: String
    var revision: Int64 = 0
    var firstOfferedAt: Int64 = 0
    var lastOfferedAt: Int64 = 0
    var saved = false
    var savedAt: Int64 = 0
    var investigatedAt: Int64 = 0
    var investigationVersion: String?
    var visitedAt: Int64 = 0
    var expeditionIds: [String] = []

    // Keep explicit null in the shared wire format rather than omitting it.
    enum CodingKeys: String, CodingKey { case destinationId, revision, firstOfferedAt, lastOfferedAt, saved, savedAt, investigatedAt, investigationVersion, visitedAt, expeditionIds }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(destinationId, forKey: .destinationId); try c.encode(revision, forKey: .revision)
        try c.encode(firstOfferedAt, forKey: .firstOfferedAt); try c.encode(lastOfferedAt, forKey: .lastOfferedAt)
        try c.encode(saved, forKey: .saved); try c.encode(savedAt, forKey: .savedAt)
        try c.encode(investigatedAt, forKey: .investigatedAt); try c.encode(investigationVersion, forKey: .investigationVersion)
        try c.encode(visitedAt, forKey: .visitedAt); try c.encode(expeditionIds, forKey: .expeditionIds)
    }
    func validate() throws {
        guard PortalContract.identifier(destinationId), [revision, firstOfferedAt, lastOfferedAt, savedAt, investigatedAt, visitedAt].allSatisfy(PortalContract.timestamp),
              firstOfferedAt <= lastOfferedAt, !saved || savedAt > 0,
              investigatedAt == 0 || investigationVersion.map(PortalContract.identifier) == true,
              investigationVersion == nil || investigationVersion.map(PortalContract.identifier) == true,
              expeditionIds.count <= 128, Set(expeditionIds).count == expeditionIds.count, expeditionIds.allSatisfy(PortalContract.identifier) else {
            throw PortalError.invalid("Invalid Exploration Trail state.")
        }
    }
    mutating func apply(_ action: PortalAction) throws {
        try validate(); try action.validate()
        guard action.destinationId == destinationId else { throw PortalError.invalid("This choice changed destination.") }
        firstOfferedAt = firstOfferedAt == 0 ? action.createdAt : min(firstOfferedAt, action.createdAt)
        lastOfferedAt = max(lastOfferedAt, action.createdAt)
        switch action.kind {
        case .save: saved = true; savedAt = action.createdAt
        case .unsave: saved = false
        case .investigate: investigatedAt = action.createdAt; investigationVersion = action.contentVersion
        case .offered: break
        }
    }
}

struct PortalTrailEntry: Codable, Equatable, Sendable {
    var type = "PortalTrailEntry"
    var schemaVersion = 1
    var id: String
    var ownerScope: String
    var destinationId: String
    var state: PortalTrailState
    var pending: [String: PortalAction] = [:]

    init(owner: String, destination: String) throws {
        id = try PortalContract.key(owner: owner, destination: destination)
        ownerScope = owner; destinationId = destination; state = PortalTrailState(destinationId: destination)
    }
    func validate() throws {
        try state.validate()
        guard type == "PortalTrailEntry", schemaVersion == 1, id == (try PortalContract.key(owner: ownerScope, destination: destinationId)), state.destinationId == destinationId,
              pending.count <= 3, ownerScope != PortalContract.guest || pending.isEmpty else { throw PortalError.invalid("Invalid Trail record.") }
        for (slot, action) in pending {
            try action.validate()
            guard slot == action.slot, action.destinationId == destinationId else { throw PortalError.invalid("Invalid pending choice.") }
        }
    }
    var orderedPending: [PortalAction] {
        pending.values.sorted { $0.createdAt == $1.createdAt ? $0.operationId < $1.operationId : $0.createdAt < $1.createdAt }
    }
    func view() throws -> PortalTrailState {
        try validate(); var result = state
        for action in orderedPending { try result.apply(action) }
        return result
    }
    mutating func queue(_ action: PortalAction) throws {
        try validate(); try action.validate()
        guard action.destinationId == destinationId else { throw PortalError.invalid("This choice changed destination.") }
        if ownerScope == PortalContract.guest { try state.apply(action) } else { pending[action.slot] = action }
    }
    mutating func accept(_ receipt: PortalSyncReceipt, expectedOwner: String) throws {
        try validate(); try receipt.state.validate()
        guard ownerScope == expectedOwner, receipt.ownerScope == ownerScope, receipt.state.destinationId == destinationId else { throw PortalError.invalid("Explorer account or destination changed.") }
        if receipt.state.revision >= state.revision { state = receipt.state }
        for (slot, action) in pending where action.operationId == receipt.operationId { pending.removeValue(forKey: slot) }
    }
}

struct PortalSyncReceipt: Codable, Sendable {
    var ownerScope: String
    var operationId: String?
    var state: PortalTrailState
}
