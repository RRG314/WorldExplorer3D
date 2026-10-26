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
struct PortalTimeline: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> PortalWidgetEntry { PortalWidgetEntry(date: .now, configuration: PortalConfiguration()) }
    func snapshot(for configuration: PortalConfiguration, in context: Context) async -> PortalWidgetEntry { entry(configuration) }
    func timeline(for configuration: PortalConfiguration, in context: Context) async -> Timeline<PortalWidgetEntry> {
        if let store = try? PortalStore(), let document = try? store.snapshot(), PortalContract.milliseconds() - document.catalogLoadedAt > 6 * 3_600_000 {
            await PortalNetwork.shared.refresh(store)
        }
        if !Task.isCancelled, let store = try? PortalStore(), let document = try? store.snapshot(), let catalog = try? store.catalog(in: document), let place = catalog.suggestion(mode: configuration.mode.rawValue, home: configuration.home?.id ?? "", now: PortalContract.milliseconds()) {
            try? store.act(destination: place.id, kind: .offered, expectedOwner: document.ownerScope)
        }
        return Timeline(entries: [entry(configuration)], policy: .after(Date().addingTimeInterval(6 * 3600)))
    }
    private func entry(_ configuration: PortalConfiguration) -> PortalWidgetEntry {
        do {
            let store = try PortalStore(), document = try store.snapshot(), catalog = try store.catalog(in: document)
            var place = catalog.suggestion(mode: configuration.mode.rawValue, home: configuration.home?.id ?? "", now: PortalContract.milliseconds())
            var page = document.learning[configuration.learningKey]
            if let learning = page, let known = catalog.place(learning.destinationId), learning.contentVersion == known.learning.version { place = known }
            else { page = nil }
            let state = try place.flatMap { document.entries[try PortalContract.key(owner: document.ownerScope, destination: $0.id)] }.map { try $0.view() }
            return PortalWidgetEntry(date: .now, configuration: configuration, owner: document.ownerScope, place: place, state: state, page: page, updatedAt: document.catalogLoadedAt)
        } catch { return PortalWidgetEntry(date: .now, configuration: configuration, unavailable: true) }
    }
}

struct PortalWidgetView: View {
    let entry: PortalWidgetEntry
    @Environment(\.widgetFamily) private var family
    private let ink = Color(red: 0.90, green: 0.95, blue: 1)
    private let muted = Color(red: 0.72, green: 0.80, blue: 0.87)
    private let accent = Color(red: 0.34, green: 0.79, blue: 0.98)
    private func open(_ section: String, id: String = "") -> URL {
        var url = URLComponents(); url.scheme = PortalContract.callbackScheme; url.host = "portal-open"; url.path = "/" + section
        if !id.isEmpty { url.queryItems = [URLQueryItem(name: "destination", value: id)] }; return url.url!
    }
    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 8 : 12) {
            HStack { Text("WORLD EXPLORER 3D").font(.caption2.bold()).foregroundStyle(accent); Spacer(); Link(destination: open("trail")) { Image(systemName: "book.closed").accessibilityLabel("Your Trail") } }
            if entry.unavailable {
                Text("Your Living Portal").font(.headline)
                Text("Open World Explorer to reconnect your Portal.").font(.caption).foregroundStyle(muted)
                Link("Open Portal", destination: open("trail")).buttonStyle(.borderedProminent)
            } else if let place = entry.place, family == .systemMedium {
                HStack(alignment: .top, spacing: 12) {
                    Link(destination: open("place", id: place.id)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(place.title).font(.subheadline.bold()).lineLimit(2)
                            Text(place.region).font(.caption2).foregroundStyle(muted).lineLimit(1)
                            Text(place.summary).font(.caption2).foregroundStyle(muted).lineLimit(2)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }.buttonStyle(.plain).accessibilityLabel("Open \(place.title)")
                    VStack(spacing: 4) {
                        Button(intent: SavePortalPlace(destination: place.id, owner: entry.owner, remove: entry.state?.saved == true)) {
                            Text(entry.state?.saved == true ? "Saved" : "Save").frame(minHeight: 32)
                        }.privacySensitive().invalidatableContent()
                        Link(destination: open("place", id: place.id)) { Text("Investigate").frame(minHeight: 32) }
                    }.font(.caption).buttonStyle(.bordered).tint(accent)
                }
            } else if let place = entry.place {
                Text(place.title).font(family == .systemSmall ? .subheadline.bold() : .headline).lineLimit(family == .systemSmall ? 3 : 2)
                if family != .systemSmall {
                    Text(place.region).font(.caption).foregroundStyle(muted).lineLimit(1)
                    if let page = entry.page {
                        Text(place.facts[min(max(0, page.index), place.facts.count - 1)]).font(.callout).foregroundStyle(muted).lineLimit(family == .systemLarge ? 7 : 3).invalidatableContent()
                    } else { Text(place.summary).font(.callout).foregroundStyle(muted).lineLimit(family == .systemLarge ? 5 : 2) }
                }
                Spacer(minLength: 0)
                HStack {
                    Button(intent: SavePortalPlace(destination: place.id, owner: entry.owner, remove: entry.state?.saved == true)) {
                        Label(entry.state?.saved == true ? "Saved" : "Save", systemImage: entry.state?.saved == true ? "bookmark.fill" : "bookmark")
                    }.privacySensitive().invalidatableContent()
                    if family != .systemSmall {
                        Button(intent: InvestigatePortalPlace(destination: place.id, owner: entry.owner, version: place.learning.version, portal: entry.configuration.learningKey, shownPage: entry.page?.index ?? -1)) {
                            Text(entry.page == nil ? "Investigate" : entry.page!.index >= place.facts.count - 1 ? "Add to Trail" : "Next fact")
                        }.invalidatableContent()
                    }
                }.font(.caption).buttonStyle(.bordered).tint(accent)
                Link("Open place", destination: open("place", id: place.id)).font(.caption.bold()).buttonStyle(.borderedProminent).tint(accent).foregroundStyle(Color(red: 0.02, green: 0.10, blue: 0.16))
            } else {
                Text(entry.configuration.mode == .together ? "Explore together" : entry.configuration.mode == .beyond ? "Beyond Earth" : "Your Home Portal").font(.headline)
                Text(entry.configuration.mode == .together ? "Open the weekly city, create a room or join a friend." : entry.configuration.mode == .beyond ? "Choose the Moon, Mars or a journey through space." : "Edit this widget to choose a Home destination.").font(.caption).foregroundStyle(muted)
                Spacer(minLength: 0)
                Link("Open Portal", destination: open(entry.configuration.mode.rawValue)).buttonStyle(.borderedProminent)
            }
        }
        .foregroundStyle(ink).tint(accent)
        .containerBackground(Color(red: 0.05, green: 0.14, blue: 0.21), for: .widget)
    }
}

@main struct LivingPortalWidget: Widget {
    let kind = "LivingPortal"
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: PortalConfiguration.self, provider: PortalTimeline()) { entry in PortalWidgetView(entry: entry) }
            .configurationDisplayName("World Explorer · Living Portal")
            .description("Discover real places, investigate their stories and keep your Exploration Trail.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
