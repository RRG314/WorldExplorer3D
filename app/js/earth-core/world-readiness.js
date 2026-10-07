// Loading-cover visibility and geometry presence are not proof of a playable
// world. Entry and resume must agree with the committed request/publication.
export function isEarthWorldUsable(context, result = null) {
  if (result?.aborted || result?.status === 'failed' ||
      (result?.state && result.state !== 'published')) return false;
  const runtime = context?.worldLoadRuntimeState;
  const publication = context?.worldPublication;
  // A completed earlier request cannot authorize its caller to place the player
  // in a newer world that happened to become ready before the caller resumed.
  if (result && (result.state !== 'published' ||
      result.requestId !== publication?.requestId ||
      result.sequence !== publication?.sequence)) return false;
  return context?.initialEarthWorldReady === true && !context.worldLoading &&
    runtime?.status === 'ready' && runtime.geometryReady === true &&
    runtime.gameplayRuntimesReady === true && runtime.session?.state === 'published' &&
    !!publication && runtime.publication === publication &&
    publication.sequence === context._worldLoadSequence &&
    publication.sequence === runtime.sequence &&
    publication.requestId === runtime.session.requestId;
}
