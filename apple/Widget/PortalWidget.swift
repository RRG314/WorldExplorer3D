import SwiftUI
import WidgetKit
import AppIntents

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

@main struct LivingPortalWidget: Widget {
    let kind = "LivingPortal"
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: PortalConfiguration.self, provider: PortalTimeline()) { entry in PortalWidgetView(entry: entry) }
            .configurationDisplayName("World Explorer · Living Portal")
            .description("Discover real places, investigate their stories and keep your Exploration Trail.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
