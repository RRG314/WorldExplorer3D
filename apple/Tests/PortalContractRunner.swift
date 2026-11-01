import Foundation

// Foundation-only native wire/storage checks on this Mac. This is not an iOS
// entitlement, WidgetKit, native sign-in, simulator or physical-device receipt.
@main struct PortalContractRunner {
    static func main() throws {
        let arguments = CommandLine.arguments
        guard arguments.count == 4 else { throw PortalError.invalid("Use FIXTURES CATALOG OWNED_TEMP_DIRECTORY.") }
        let count = try PortalContractChecks.run(fixtures: URL(fileURLWithPath: arguments[1]), catalog: URL(fileURLWithPath: arguments[2]), directory: URL(fileURLWithPath: arguments[3]))
        print("Apple Foundation shared contract/storage cases passed: \(count)")
    }
}
