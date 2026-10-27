import Foundation
import Vision

// Vision can group an icon with its label (the search icon becomes "Q").
// Match complete label words and use their own bounds, while retaining every
// match so the caller rejects ambiguous controls. "Save" never matches "Saved".
func systemControlLabelRanges(_ label: String, in line: String) throws -> [Range<String.Index>] {
    let pattern = "(?<![\\p{L}\\p{N}])" + NSRegularExpression.escapedPattern(for: label) + "(?![\\p{L}\\p{N}])"
    let regex = try NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    return regex.matches(in: line, range: NSRange(line.startIndex..., in: line)).compactMap { Range($0.range, in: line) }
}

func visibleSystemControlBounds(_ label: String, observations: [VNRecognizedTextObservation], lowerPart: Bool = false, exactLine: Bool = false) throws -> [CGRect] {
    try observations.flatMap { observation -> [CGRect] in
        guard let candidate = observation.topCandidates(1).first, candidate.confidence >= 0.6 else { return [] }
        // During dismissal the old "Edit Home Screen" menu can remain visible.
        // Its Edit word is not the new Home Screen's standalone Edit control.
        if exactLine, candidate.string.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(label) != .orderedSame { return [] }
        return try systemControlLabelRanges(label, in: candidate.string).compactMap { range in
            guard let box = try? candidate.boundingBox(for: range)?.boundingBox,
                  !lowerPart || box.midY < 0.35 else { return nil }
            return box
        }
    }
}
