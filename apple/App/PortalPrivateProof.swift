import Foundation
import Security
import CryptoKit

struct PortalConnectionProof: Codable, Sendable {
    var requestId: String
    var verifier: String
    var verificationCode: String
    var expiresAt: Int64
    static func opaque(_ value: String) -> Bool { value.utf8.count == 43 && value.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil }
    static func random() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw PortalError.invalid("A secure connection could not be prepared. Try again.") }
        return urlBase64(Data(bytes))
    }
    static func urlBase64(_ data: Data) -> String { data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
    static func challenge(_ verifier: String) -> String { urlBase64(Data(SHA256.hash(data: Data(verifier.utf8)))) }
    func validate() throws {
        guard Self.opaque(requestId), Self.opaque(verifier), verificationCode.utf8.count == 8, verificationCode.range(of: "^[0-9]{8}$", options: .regularExpression) != nil,
              expiresAt > PortalContract.milliseconds(), expiresAt <= PortalContract.milliseconds() + 11 * 60_000 else { throw PortalError.invalid("This device connection expired. Start again.") }
    }
}

/// Short-lived verifier only. The widget App Group never receives this record;
/// Firebase keeps its own refresh credentials in the SDK's private keychain.
struct PortalPrivateProof {
    private var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: PortalContract.callbackScheme + ".portal-connection", kSecAttrAccount as String: "pending"] }
    func read() throws -> PortalConnectionProof? {
        var request = query; request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?; let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw PortalError.invalid("Unlock the device and reopen your Portal connection.") }
        do { return try JSONDecoder().decode(PortalConnectionProof.self, from: data) }
        catch { try clear(); return nil }
    }
    func write(_ proof: PortalConnectionProof) throws {
        try proof.validate(); let data = try JSONEncoder().encode(proof)
        let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query; attributes.forEach { item[$0.key] = $0.value }
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw PortalError.invalid("The secure connection could not be saved.") }
        } else if status != errSecSuccess { throw PortalError.invalid("The secure connection could not be saved.") }
    }
    func clear() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw PortalError.invalid("The saved connection could not close. Unlock the device and try again.") }
    }
}

final class PortalGeneration: @unchecked Sendable {
    private let lock = NSLock()
    private var value: UInt64 = 0
    func next() -> UInt64 { lock.lock(); defer { lock.unlock() }; value &+= 1; return value }
    func capture() -> UInt64 { lock.lock(); defer { lock.unlock() }; return value }
    func current(_ version: UInt64) -> Bool { lock.lock(); defer { lock.unlock() }; return value == version }
}
