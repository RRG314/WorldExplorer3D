import SwiftUI
import WidgetKit
import BackgroundTasks
import UIKit

@MainActor final class PortalAppModel: ObservableObject {
    @Published var document = PortalDocument()
    @Published var collection: PortalCatalog?
    @Published var message = ""
    @Published var section = "discover"
    @Published var openedDestination: String?
    let store: PortalStore?
    let account: PortalAccount?
    init() {
        do { let storage = try PortalStore(); store = storage; account = PortalAccount.shared(store: storage); reload() }
        catch { store = nil; account = nil; message = "The shared Portal could not open. Reopen World Explorer and try again." }
    }
    func reload() {
        guard let store else { return }
        do { document = try store.snapshot(); collection = try store.catalog(in: document) }
        catch { message = "Your Trail could not open. Your saved file is kept. Try again." }
    }
    func act(_ id: String, kind: PortalAction.Kind, owner: String, version: String? = nil) {
        guard let store else { return }
        do {
            try store.act(destination: id, kind: kind, expectedOwner: owner, learningVersion: version)
            message = ""; reload(); WidgetCenter.shared.reloadAllTimelines()
            Task { await account?.synchronize(); reload() }
        } catch { message = (error as? PortalError)?.localizedDescription ?? "Your choice could not save. Try again."; reload() }
    }
    func state(_ id: String) -> PortalTrailState? {
        guard let key = try? PortalContract.key(owner: document.ownerScope, destination: id) else { return nil }
        return try? document.entries[key]?.view()
    }
    var trail: [PortalTrailState] {
        document.entries.values.filter { $0.ownerScope == document.ownerScope }.compactMap { try? $0.view() }
            .filter { $0.saved || $0.investigatedAt > 0 || $0.visitedAt > 0 }
            .sorted { max($0.savedAt, max($0.investigatedAt, $0.visitedAt)) > max($1.savedAt, max($1.investigatedAt, $1.visitedAt)) }
    }
    func openGame(_ path: String = "/app/") {
        guard let url = URL(string: path, relativeTo: PortalContract.origin)?.absoluteURL, url.scheme == "https", url.host == PortalContract.origin.host, url.path == "/app/", url.user == nil, url.password == nil else { return }
        UIApplication.shared.open(url)
    }
    func route(_ url: URL) {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false), parts.scheme == PortalContract.callbackScheme, parts.user == nil, parts.password == nil, parts.port == nil, parts.fragment == nil else { return }
        if parts.host == "portal-connect" { section = "account"; account?.receive(url); return }
        guard parts.host == "portal-open" else { return }
        switch parts.path {
        case "/place":
            guard parts.queryItems?.count == 1, let id = parts.queryItems?.first(where: { $0.name == "destination" })?.value, collection?.place(id) != nil else { return }
            section = "discover"; openedDestination = id
        case "/trail": section = "trail"
        case "/together": section = "together"
        case "/beyond": section = "beyond"
        case "/home", "/wander", "/nature": section = "discover"
        default: break
        }
    }
}

private enum PortalStyle {
    static let background = Color(red: 0.027, green: 0.078, blue: 0.137)
    static let card = Color(red: 0.055, green: 0.14, blue: 0.21)
    static let accent = Color(red: 0.34, green: 0.79, blue: 0.98)
    static let muted = Color(red: 0.72, green: 0.80, blue: 0.87)
}

struct PortalRootView: View {
    @ObservedObject var model: PortalAppModel
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("WORLD EXPLORER 3D").font(.caption.bold()).foregroundStyle(PortalStyle.accent)
                    Text("The Living Portal").font(.largeTitle.bold())
                    ViewThatFits(in: .horizontal) {
                        HStack { navigationButtons }
                        VStack(alignment: .leading) { navigationButtons }
                    }.buttonStyle(.bordered).tint(PortalStyle.accent)
                    if !model.message.isEmpty { Text(model.message).foregroundStyle(PortalStyle.muted).accessibilityAddTraits(.updatesFrequently) }
                    if model.section == "account", let account = model.account { PortalAccountView(model: model, account: account) }
                    else if model.section == "together" { together }
                    else if model.section == "beyond" { beyond }
                    else if model.section == "trail" { trail }
                    else { discover }
                }.padding(20).frame(maxWidth: 820, alignment: .leading).frame(maxWidth: .infinity)
            }
            .background(PortalStyle.background).foregroundStyle(.white).tint(PortalStyle.accent)
            .navigationDestination(for: String.self) { id in PortalPlaceView(model: model, id: id) }
            .sheet(item: Binding(get: { model.openedDestination.map { PortalOpenedPlace(id: $0) } }, set: { model.openedDestination = $0?.id })) { item in
                NavigationStack { PortalPlaceView(model: model, id: item.id).toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { model.openedDestination = nil } } } }
            }
            .task { await model.account?.bootstrap(); model.reload(); PortalBackground.schedule() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { model.reload(); Task { await model.account?.synchronize(); model.reload() } }
                if phase == .background { PortalBackground.schedule() }
            }
        }.preferredColorScheme(.dark)
    }
    @ViewBuilder private var navigationButtons: some View {
        Button("Discover") { model.section = "discover" }; Button("Your Trail") { model.section = "trail" }
        Button("Account") { model.section = "account" }; Button("Open game") { model.openGame() }
    }
    private var discover: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("A small window into real places").font(.title2.bold())
            Text("Save a place, investigate its story and return when you have time to explore. Saving or reading keeps a different record from a visit in the 3D world.").foregroundStyle(PortalStyle.muted)
            ForEach(model.collection?.destinations ?? []) { place in
                NavigationLink(value: place.id) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(place.title).font(.headline); Text(place.region).font(.caption).foregroundStyle(PortalStyle.accent)
                        Text(place.summary).foregroundStyle(PortalStyle.muted)
                    }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(PortalStyle.card, in: RoundedRectangle(cornerRadius: 18))
                }.buttonStyle(.plain)
            }
            Button("Explore together") { model.section = "together" }; Button("Beyond Earth") { model.section = "beyond" }
            Text("Add the Living Portal widget by touching and holding your Home Screen, then choosing Edit → Add Widget. Edit the widget to choose Wander, Home, Nature, Together or Beyond Earth.").font(.footnote).foregroundStyle(PortalStyle.muted)
            Button("Refresh collection") { Task { if let store = model.store { await PortalNetwork.shared.refresh(store); model.reload(); WidgetCenter.shared.reloadAllTimelines() } } }
        }
    }
    private var trail: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Your Exploration Trail").font(.title2.bold())
            Text("Saved, investigated and visited in 3D stay separate from your game rewards and expeditions.").foregroundStyle(PortalStyle.muted)
            if model.trail.isEmpty { Text("Your Trail starts with a place that catches your interest.") }
            ForEach(model.trail, id: \.destinationId) { state in
                VStack(alignment: .leading, spacing: 8) {
                    Text(model.collection?.place(state.destinationId)?.title ?? state.destinationId).font(.headline)
                    Text([state.saved ? "Saved" : nil, state.investigatedAt > 0 ? "Investigated" : nil, state.visitedAt > 0 ? "Visited in 3D" : nil].compactMap { $0 }.joined(separator: " · ")).foregroundStyle(PortalStyle.muted)
                    if model.collection?.place(state.destinationId) != nil { NavigationLink("Open place", value: state.destinationId) }
                }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(PortalStyle.card, in: RoundedRectangle(cornerRadius: 18))
            }
            Text(model.document.ownerScope == PortalContract.guest ? "Portal's device Trail · connect your Explorer account to share saved places and investigations with the game's Journal." : "Account Trail · offline choices sync when connected.").font(.footnote).foregroundStyle(PortalStyle.muted)
        }
    }
    private var together: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Explore together").font(.title2.bold())
            Text("Enter the shared weekly city, create a room or join a friend. The game checks your sign-in and current room availability.").foregroundStyle(PortalStyle.muted)
            Button("Open Multiplayer") { model.openGame("/app/?tab=multiplayer") }.buttonStyle(.borderedProminent)
        }
    }
    private var beyond: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Beyond Earth").font(.title2.bold()); Text("Choose the Moon, Mars or a journey through space.").foregroundStyle(PortalStyle.muted)
            ForEach(["moon", "mars", "space"], id: \.self) { body in Button(body.capitalized) { model.openGame("/app/?launch=" + body + "&gm=free") }.buttonStyle(.borderedProminent) }
        }
    }
}
private struct PortalOpenedPlace: Identifiable { let id: String }

struct PortalPlaceView: View {
    @ObservedObject var model: PortalAppModel
    let id: String
    var body: some View {
        let owner = model.document.ownerScope
        ScrollView {
            if let place = model.collection?.place(id) {
                let state = model.state(id)
                VStack(alignment: .leading, spacing: 20) {
                    Text(place.title).font(.largeTitle.bold()); Text(place.region).foregroundStyle(PortalStyle.accent)
                    Text(place.summary).foregroundStyle(PortalStyle.muted)
                    Button(state?.saved == true ? "Remove from saved places" : "Save place") { model.act(id, kind: state?.saved == true ? .unsave : .save, owner: owner) }.buttonStyle(.borderedProminent)
                    if model.collection?.gameAvailable(place, now: PortalContract.milliseconds()) == true {
                        Button("Enter World") { model.openGame(place.gameLink) }.buttonStyle(.bordered)
                    } else { Text("3D entry is being checked for this destination. You can save it and investigate now.").font(.footnote).foregroundStyle(PortalStyle.muted) }
                    Text(place.learning.title).font(.title2.bold())
                    ForEach(Array(place.learning.paragraphs.enumerated()), id: \.offset) { _, paragraph in Text(paragraph) }
                    Text("Read more").font(.headline)
                    ForEach(Array(place.learning.sources.enumerated()), id: \.offset) { _, source in Link(source.title, destination: source.url) }
                    Button(state?.investigationVersion == place.learning.version ? "Investigated" : "Add to Investigated") { model.act(id, kind: .investigate, owner: owner, version: place.learning.version) }.buttonStyle(.borderedProminent)
                    if !model.message.isEmpty { Text(model.message).foregroundStyle(PortalStyle.muted) }
                }.padding(20).frame(maxWidth: 820, alignment: .leading).frame(maxWidth: .infinity)
            }
        }.background(PortalStyle.background).foregroundStyle(.white).tint(PortalStyle.accent).preferredColorScheme(.dark)
    }
}

struct PortalAccountView: View {
    @ObservedObject var model: PortalAppModel
    @ObservedObject var account: PortalAccount
    @State private var copyOwner: String?
    @State private var disconnectOwner: String?
    var body: some View {
        let owner = model.document.ownerScope
        let version = account.version
        VStack(alignment: .leading, spacing: 18) {
            Text("Explorer account").font(.title2.bold())
            Text(account.accountLabel.isEmpty ? "Portal's device Trail" : account.accountLabel)
            if !account.message.isEmpty { Text(account.message).foregroundStyle(PortalStyle.muted) }
            if !account.verificationCode.isEmpty, let url = account.approvalURL {
                Text("Check that this code matches your browser before approving.").foregroundStyle(PortalStyle.muted)
                Text(account.verificationCode).font(.largeTitle.monospaced().bold()).textSelection(.enabled)
                Link("Approve in browser", destination: url).buttonStyle(.borderedProminent)
                Button("Cancel connection") { account.cancel(displayedVersion: version) }.buttonStyle(.bordered)
            } else if account.phase == "connecting" { ProgressView("Connecting…"); Button("Cancel connection") { account.cancel(displayedVersion: version) } }
            else { Button(account.accountLabel.isEmpty ? "Connect your Explorer account" : "Connect a different account") { account.begin() }.buttonStyle(.borderedProminent) }
            if owner != PortalContract.guest {
                Button("Sync Trail now") { Task { await account.synchronize(); model.reload() } }
                Button("Copy device choices") { copyOwner = owner }
                Button("Disconnect Portal") { disconnectOwner = owner }
            }
            Text("Use your existing World Explorer account in the browser. The widget never asks for your password. Connecting keeps device choices separate; you can choose to copy saved places and current investigations.").font(.footnote).foregroundStyle(PortalStyle.muted)
        }
        .onChange(of: account.phase) { _, _ in model.reload() }
        .confirmationDialog("Copy this Portal's saved places and current investigations? Visits and expeditions stay with their original Trail.", isPresented: Binding(get: { copyOwner != nil }, set: { if !$0 { copyOwner = nil } }), titleVisibility: .visible) {
            if let expected = copyOwner { Button("Copy device choices") { account.copyDeviceChoices(displayedOwner: expected); copyOwner = nil } }
            Button("Cancel", role: .cancel) { copyOwner = nil }
        }
        .confirmationDialog("Disconnect this Portal? Your account Trail is kept. Other sign-ins stay connected.", isPresented: Binding(get: { disconnectOwner != nil }, set: { if !$0 { disconnectOwner = nil } }), titleVisibility: .visible) {
            if let expected = disconnectOwner { Button("Disconnect Portal", role: .destructive) { account.disconnect(displayedOwner: expected); disconnectOwner = nil; model.reload() } }
            Button("Cancel", role: .cancel) { disconnectOwner = nil }
        }
    }
}

enum PortalBackground {
    static let identifier = PortalContract.callbackScheme + ".portal-refresh"
    static func schedule() {
        BGTaskScheduler.shared.getPendingTaskRequests { requests in
            guard !requests.contains(where: { $0.identifier == identifier }) else { return }
            let request = BGAppRefreshTaskRequest(identifier: identifier); request.earliestBeginDate = Date().addingTimeInterval(6 * 3600)
            try? BGTaskScheduler.shared.submit(request)
        }
    }
}
final class PortalAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: PortalBackground.identifier, using: nil) { task in
            let lease = PortalBackgroundLease(task: task)
            let work = Task { @MainActor in
                PortalBackground.schedule()
                guard lease.active else { return }
                let model = PortalAppModel()
                if let store = model.store { await PortalNetwork.shared.refresh(store) }
                if !Task.isCancelled, lease.active { await model.account?.synchronize(allowed: { lease.active }) }
                lease.finish(success: !Task.isCancelled)
            }
            task.expirationHandler = { lease.expire(); work.cancel() }
        }
        return true
    }
}

/// A system background task may expire while an SDK operation is draining.
/// Revoke its publication and complete the OS task exactly once.
private final class PortalBackgroundLease: @unchecked Sendable {
    private let lock = NSLock()
    private let task: BGTask
    private var finished = false
    init(task: BGTask) { self.task = task }
    var active: Bool { lock.lock(); defer { lock.unlock() }; return !finished }
    func expire() { finish(success: false) }
    func finish(success: Bool) {
        lock.lock(); if finished { lock.unlock(); return }; finished = true; lock.unlock()
        task.setTaskCompleted(success: success)
    }
}

@main struct WorldExplorerPortalApp: App {
    @UIApplicationDelegateAdaptor(PortalAppDelegate.self) private var delegate
    @StateObject private var model = PortalAppModel()
    var body: some Scene { WindowGroup { PortalRootView(model: model).onOpenURL { model.route($0) } } }
}
