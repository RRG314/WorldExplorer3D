import Foundation

/// Small HTTPS messages only. Redirects cannot move a trusted catalog or an
/// authenticated request to another origin. No renderer, GPS or persistent link.
final class PortalNetwork: @unchecked Sendable {
    private final class RejectRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }
    static let shared = PortalNetwork()
    private let session: URLSession
    private init() {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false; config.urlCache = nil
        config.timeoutIntervalForRequest = 6; config.timeoutIntervalForResource = 12
        session = URLSession(configuration: config, delegate: RejectRedirects(), delegateQueue: nil)
    }
    func data(_ request: URLRequest, limit: Int) async throws -> Data {
        guard request.url?.scheme == "https", [PortalContract.origin.host, PortalContract.apiOrigin.host].contains(request.url?.host), request.url?.user == nil, request.url?.password == nil, request.url?.port == nil || request.url?.port == 443 else { throw PortalError.invalid("Invalid Portal service address.") }
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw PortalError.invalid(status == 401 || status == 403 ? "Reconnect your Explorer account when online." : status == 410 ? "This device connection expired. Start again." : "Connection is unavailable. Your saved choices are kept.")
        }
        guard response.expectedContentLength <= Int64(limit) else { throw PortalError.invalid("The Portal response is too large.") }
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < limit else { throw PortalError.invalid("The Portal response is too large.") }
            data.append(byte)
        }
        return data
    }
    func refresh(_ store: PortalStore) async {
        do {
            let request = URLRequest(url: PortalContract.origin.appendingPathComponent("portal/catalog.json"))
            let data = try await data(request, limit: 131_072)
            try store.acceptCatalog(data, current: { !Task.isCancelled })
        } catch { /* Last successfully validated collection remains available. */ }
    }
}
