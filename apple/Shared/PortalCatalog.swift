import Foundation

struct PortalCatalog: Codable, Sendable {
    struct Destination: Codable, Identifiable, Sendable {
        struct Geography: Codable, Sendable {
            struct Origin: Codable, Sendable { var lat: Double; var lon: Double }
            var id: String; var revision: String; var contentVersion: String; var origin: Origin
        }
        struct Learning: Codable, Sendable {
            struct Source: Codable, Sendable { var title: String; var url: URL }
            var version: String; var title: String; var paragraphs: [String]; var sources: [Source]
        }
        var id: String; var title: String; var region: String; var summary: String; var tags: [String]
        var destination: Geography; var learning: Learning; var gameLink: String
        var facts: [String] {
            learning.paragraphs.flatMap { paragraph -> [String] in
                var result: [String] = [], part = ""
                for word in paragraph.split(whereSeparator: \.isWhitespace) {
                    if !part.isEmpty && part.count + word.count + 1 > 160 { result.append(part); part = "" }
                    part += (part.isEmpty ? "" : " ") + word
                }
                if !part.isEmpty { result.append(part) }; return result
            }
        }
    }
    struct Offer: Codable, Sendable {
        var destinationId: String; var deviceProfile: String; var checkedAt: Int64; var validUntil: Int64
        var destinationRevision: String; var contentVersion: String; var renderContractVersion: String
    }
    var schemaVersion: Int; var version: String; var renderContractVersion: String
    var destinations: [Destination]; var offers: [Offer]
    func validate() throws {
        guard schemaVersion == 1, PortalContract.identifier(version), !renderContractVersion.isEmpty, renderContractVersion.count <= 160,
              (1...32).contains(destinations.count), Set(destinations.map(\.id)).count == destinations.count, offers.count <= 128 else { throw PortalError.invalid("Unsupported Portal collection.") }
        for row in destinations {
            let point = row.destination.origin
            guard PortalContract.identifier(row.id), row.id == row.destination.id, PortalContract.identifier(row.destination.revision), PortalContract.identifier(row.destination.contentVersion),
                  PortalContract.identifier(row.learning.version), point.lat.isFinite, abs(point.lat) <= 90, point.lon.isFinite, abs(point.lon) <= 180,
                  (1...180).contains(row.title.count), (1...180).contains(row.region.count), (1...800).contains(row.summary.count),
                  (1...8).contains(row.learning.paragraphs.count), row.learning.paragraphs.allSatisfy({ (1...2000).contains($0.count) }),
                  (1...8).contains(row.learning.sources.count), row.learning.sources.allSatisfy({ source in
                      (1...240).contains(source.title.count) && source.url.scheme == "https" && source.url.host != nil && source.url.user == nil && source.url.password == nil
                  }), (1...16).contains(row.tags.count), row.tags.allSatisfy(PortalContract.identifier),
                  row.gameLink == "/app/?portal=\(PortalContract.component(row.id))&pr=\(PortalContract.component(row.destination.revision))" else { throw PortalError.invalid("Invalid Portal destination.") }
        }
    }
    func place(_ id: String) -> Destination? { destinations.first { $0.id == id } }
    func suggestion(mode: String, home: String, now: Int64) -> Destination? {
        if mode == "together" || mode == "beyond" { return nil }
        if mode == "home" { return place(home) }
        let choices = destinations.filter { mode != "nature" || $0.tags.contains("nature") }
        guard !choices.isEmpty else { return nil }
        return choices[Int(max(0, now / 86_400_000) % Int64(choices.count))]
    }
    func gameAvailable(_ place: Destination, now: Int64) -> Bool {
        offers.contains { offer in
            offer.destinationId == place.id && offer.deviceProfile == "mobile-touch" && offer.checkedAt > 0 && offer.checkedAt <= now && offer.validUntil > now &&
            offer.destinationRevision == place.destination.revision && offer.contentVersion == place.destination.contentVersion && offer.renderContractVersion == renderContractVersion
        }
    }
}
