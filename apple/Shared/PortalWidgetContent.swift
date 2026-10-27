// Shared real widget composition. Native snapshot checks render this same view;
// no duplicate widget, account or progression owner.
import SwiftUI
import WidgetKit
import AppIntents

struct PortalWidgetEntry: TimelineEntry {
    var date: Date
    var configuration: PortalConfiguration
    var owner = PortalContract.guest
    var place: PortalCatalog.Destination?
    var state: PortalTrailState?
    var page: PortalLearningPage?
    var updatedAt: Int64 = 0
    var unavailable = false
}
struct PortalWidgetView: View {
    let entry: PortalWidgetEntry
    @Environment(\.widgetFamily) private var family
    var body: some View { PortalWidgetComposition(entry: entry, family: family) }
}
struct PortalWidgetComposition: View {
    let entry: PortalWidgetEntry
    let family: WidgetFamily
    private func open(_ section: String, id: String = "") -> URL {
        var url = URLComponents(); url.scheme = PortalContract.callbackScheme; url.host = "portal-open"; url.path = "/" + section
        if !id.isEmpty { url.queryItems = [URLQueryItem(name: "destination", value: id)] }; return url.url!
    }
    private var brand: some View {
        Text("WORLD EXPLORER 3D").font(.caption2.bold()).foregroundStyle(PortalStyle.accent).lineLimit(1)
    }
    private func shortTitle(_ place: PortalCatalog.Destination) -> String {
        place.title.components(separatedBy: " · ").first ?? place.title
    }
    private func save(_ place: PortalCatalog.Destination) -> some View {
        Button(intent: SavePortalPlace(destination: place.id, owner: entry.owner, remove: entry.state?.saved == true)) {
            Text(entry.state?.saved == true ? "Saved" : "Save").frame(maxWidth: .infinity, minHeight: 44)
        }.privacySensitive().invalidatableContent().buttonStyle(.bordered)
    }
    private func openPlace(_ place: PortalCatalog.Destination) -> some View {
        Link(destination: open("place", id: place.id)) {
            Text(family == .systemSmall ? "Open" : "Open place").frame(maxWidth: .infinity, minHeight: 44)
        }.accessibilityLabel("Open place").buttonStyle(.borderedProminent).foregroundStyle(PortalStyle.actionText)
    }
    private func small(_ place: PortalCatalog.Destination, details: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if details { brand }
            Text(shortTitle(place)).font(.headline).lineLimit(2).fixedSize(horizontal: false, vertical: true).accessibilityLabel(place.title)
            if details { Text(place.region).font(.caption2).foregroundStyle(PortalStyle.muted).lineLimit(1) }
            Spacer(minLength: 0)
            HStack(spacing: 6) { save(place); openPlace(place) }.font(.caption2)
        }
    }
    private func medium(_ place: PortalCatalog.Destination, details: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            brand
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(shortTitle(place)).font(.headline).lineLimit(2).accessibilityLabel(place.title)
                    Text(place.region).font(.caption2).foregroundStyle(PortalStyle.muted).lineLimit(1)
                    if details { Text(place.summary).font(.caption2).foregroundStyle(PortalStyle.muted).lineLimit(2) }
                }.frame(maxWidth: .infinity, alignment: .leading)
                VStack(spacing: 4) {
                    save(place)
                    Link(destination: open("place", id: place.id)) { Text("Investigate").frame(minHeight: 44) }.buttonStyle(.bordered)
                }.font(.caption2).fixedSize(horizontal: true, vertical: true)
            }
        }
    }
    private func large(_ place: PortalCatalog.Destination, inlineFacts: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            brand
            Text(place.title).font(.headline).lineLimit(2).fixedSize(horizontal: false, vertical: true)
            Text(place.region).font(.caption).foregroundStyle(PortalStyle.muted).lineLimit(1)
            if inlineFacts, let page = entry.page {
                // Never offer Next/Add to Trail for a fact which the allocated
                // widget cannot show. The fallback opens its complete native view.
                Text(place.facts[min(max(0, page.index), place.facts.count - 1)])
                    .font(.callout).foregroundStyle(PortalStyle.muted).fixedSize(horizontal: false, vertical: true).invalidatableContent()
                Spacer(minLength: 0)
            } else {
                Text(entry.page.map { place.facts[min(max(0, $0.index), place.facts.count - 1)] } ?? place.summary)
                    .font(.callout).foregroundStyle(PortalStyle.muted).lineLimit(3)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).layoutPriority(-1)
            }
            HStack(spacing: 8) {
                save(place)
                if inlineFacts {
                    Button(intent: InvestigatePortalPlace(destination: place.id, owner: entry.owner, version: place.learning.version, portal: entry.configuration.learningKey, shownPage: entry.page?.index ?? -1)) {
                        Text(entry.page == nil ? "Investigate" : entry.page!.index >= place.facts.count - 1 ? "Add to Trail" : "Next fact").frame(maxWidth: .infinity, minHeight: 44)
                    }.buttonStyle(.bordered).invalidatableContent()
                } else {
                    Link(destination: open("place", id: place.id)) { Text(entry.page == nil ? "Investigate" : "Read full fact").frame(maxWidth: .infinity, minHeight: 44) }.buttonStyle(.bordered)
                }
            }.font(.caption)
            openPlace(place).font(.caption.bold())
        }
    }
    private func status(title: String, message: String, section: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            brand
            Text(title).font(.headline).lineLimit(2)
            Text(message).font(.caption).foregroundStyle(PortalStyle.muted).lineLimit(family == .systemSmall ? 2 : 4).layoutPriority(-1)
            Spacer(minLength: 0)
            Link(destination: open(section)) { Text("Open Portal").frame(maxWidth: .infinity, minHeight: 44) }.font(.caption.bold()).buttonStyle(.borderedProminent).foregroundStyle(PortalStyle.actionText)
        }
    }
    var body: some View {
        Group {
            if entry.unavailable {
                status(title: "Your Living Portal", message: "Open World Explorer to reconnect your Portal.", section: "trail")
            } else if let place = entry.place {
                Group {
                    if family == .systemSmall { ViewThatFits(in: .vertical) { small(place, details: true); small(place, details: false); openPlace(place).font(.caption) } }
                    else if family == .systemMedium { ViewThatFits(in: .vertical) { medium(place, details: true); medium(place, details: false); small(place, details: false); openPlace(place).font(.caption) } }
                    else { ViewThatFits(in: .vertical) { large(place, inlineFacts: true); large(place, inlineFacts: false); small(place, details: false); openPlace(place).font(.caption) } }
                }.widgetURL(open("place", id: place.id))
            } else {
                status(title: entry.configuration.mode == .together ? "Explore together" : entry.configuration.mode == .beyond ? "Beyond Earth" : "Your Home Portal",
                       message: entry.configuration.mode == .together ? "Open the weekly city, create a room or join a friend." : entry.configuration.mode == .beyond ? "Choose the Moon, Mars or a journey through space." : "Edit this widget to choose a Home destination.", section: entry.configuration.mode.rawValue)
            }
        }
        .foregroundStyle(PortalStyle.text).tint(PortalStyle.accent)
        .containerBackground(PortalStyle.card, for: .widget)
    }
}
