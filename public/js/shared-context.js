// Shared module context for cross-module runtime state and APIs.
// Replaces implicit globalThis coupling with an explicit imported module object.
const ctx = Object.create(null);

export { ctx };
