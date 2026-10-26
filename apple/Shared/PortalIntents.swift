import AppIntents
import WidgetKit

enum PortalMode: String, AppEnum {
    case wander, home, nature, together, beyond
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Portal experience"
    static let caseDisplayRepresentations: [PortalMode: DisplayRepresentation] = [
        .wander: "Wander — somewhere new", .home: "Home — a favorite place", .nature: "Nature — landscapes and geology",
        .together: "Together — multiplayer worlds", .beyond: "Beyond Earth — planets and space"
    ]
}

struct PortalPlaceEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Home destination"
    static let defaultQuery = PortalPlaceQuery()
    var id: String
    var title: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(title)") }
}
struct PortalPlaceQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [PortalPlaceEntity] {
        try PortalStore().catalog().destinations.filter { identifiers.contains($0.id) }.map { PortalPlaceEntity(id: $0.id, title: $0.title) }
    }
    func suggestedEntities() async throws -> [PortalPlaceEntity] {
        try PortalStore().catalog().destinations.map { PortalPlaceEntity(id: $0.id, title: $0.title) }
    }
}
struct PortalConfiguration: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Your Living Portal"
    static let description = IntentDescription("Choose what your Portal follows. Home uses the destination you select below.")
    @Parameter(title: "Experience", default: .wander) var mode: PortalMode
    @Parameter(title: "Home destination") var home: PortalPlaceEntity?
    var learningKey: String { mode.rawValue + ":" + (home?.id ?? "default") }
}

struct SavePortalPlace: AppIntent {
    static let title: LocalizedStringResource = "Save a Portal place"
    static let isDiscoverable = false
    @Parameter(title: "Destination") var destination: String
    @Parameter(title: "Explorer") var owner: String
    @Parameter(title: "Remove", default: false) var remove: Bool
    init() {}
    init(destination: String, owner: String, remove: Bool) { self.destination = destination; self.owner = owner; self.remove = remove }
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let dialog: IntentDialog
        do { try PortalStore().act(destination: destination, kind: remove ? .unsave : .save, expectedOwner: owner) }
        catch { WidgetCenter.shared.reloadTimelines(ofKind: "LivingPortal"); return .result(dialog: "Reopen the Portal to check the account and try again. Your saved Trail is kept.") }
        dialog = remove ? "Place removed from saved places." : "Place saved to your Trail."
        WidgetCenter.shared.reloadTimelines(ofKind: "LivingPortal"); return .result(dialog: dialog)
    }
}
struct InvestigatePortalPlace: AppIntent {
    static let title: LocalizedStringResource = "Investigate a Portal place"
    static let isDiscoverable = false
    @Parameter(title: "Destination") var destination: String
    @Parameter(title: "Explorer") var owner: String
    @Parameter(title: "Investigation") var version: String
    @Parameter(title: "Portal") var portal: String
    @Parameter(title: "Next", default: false) var next: Bool
    init() {}
    init(destination: String, owner: String, version: String, portal: String, next: Bool) {
        self.destination = destination; self.owner = owner; self.version = version; self.portal = portal; self.next = next
    }
    func perform() async throws -> some IntentResult & ProvidesDialog {
        do { try PortalStore().investigate(key: portal, destination: destination, expectedOwner: owner, version: version, next: next) }
        catch { WidgetCenter.shared.reloadTimelines(ofKind: "LivingPortal"); return .result(dialog: "This account or investigation changed. Reopen the Portal before marking it complete.") }
        WidgetCenter.shared.reloadTimelines(ofKind: "LivingPortal"); return .result(dialog: "Your Portal investigation is updated.")
    }
}
