#if DEBUG && WE3D_STAGING && targetEnvironment(simulator)
import Foundation
@preconcurrency import FirebaseCore
@preconcurrency import FirebaseAppCheck

// Only the separately identified simulator development client can read this
// private, short-lived CI fixture. Release and physical-device binaries exclude
// this provider. Live services still verify Google's signed App Check token.
struct PortalNativeAcceptance: Decodable, Sendable {
    var project: String
    var appId: String
    var uid: String
    var expiresAt: Int64
    var nativeCheck: String
    var webCheck: String
    var browserApiKey: String
    var browserEmail: String
    var browserPassword: String
    static var url: URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("native-acceptance.json") }
    static func load() throws -> Self? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let data = try Data(contentsOf: url)
        guard data.count <= 16_384 else { throw PortalError.invalid("Invalid native verification fixture.") }
        let value = try JSONDecoder().decode(Self.self, from: data)
        guard PortalContract.callbackScheme == "io.worldexplorer3d.app.staging", value.project == "we3d-staging-20260712", value.appId == "1:524178734996:ios:2d8e12cf5c57d2cef51981",
              value.expiresAt > PortalContract.milliseconds() + 120_000, PortalContract.owner("account:" + value.uid) else { throw PortalError.invalid("Native verification fixture expired or changed identity.") }
        return value
    }
}
final class PortalDebugAttestation: NSObject, AppCheckProviderFactory {
    let fixture: PortalNativeAcceptance
    init(_ fixture: PortalNativeAcceptance) { self.fixture = fixture }
    static func factory() throws -> (any AppCheckProviderFactory)? { try PortalNativeAcceptance.load().map { PortalDebugAttestation($0) } }
    func createProvider(with app: FirebaseApp) -> (any AppCheckProvider)? {
        guard app.options.googleAppID == fixture.appId else { return nil }
        return PortalTemporaryProvider(token: fixture.nativeCheck, expiresAt: fixture.expiresAt)
    }
}
private final class PortalTemporaryProvider: NSObject, AppCheckProvider {
    let token: String
    let expiresAt: Int64
    init(token: String, expiresAt: Int64) { self.token = token; self.expiresAt = expiresAt }
    func getToken() async throws -> AppCheckToken {
        guard expiresAt > PortalContract.milliseconds() else { throw PortalError.invalid("Native verification attestation expired.") }
        return AppCheckToken(token: token, expirationDate: Date(timeIntervalSince1970: Double(expiresAt) / 1000))
    }
}
#endif
