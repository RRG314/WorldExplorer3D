// Loading-cover visibility and geometry presence are not proof of a playable
// world. Entry and resume must agree with the committed request/publication.
export function isEarthWorldUsable(context, result = null) {
  if (result?.aborted || result?.status === 'failed' ||
      (result?.state && result.state !== 'published')) return false;
  const runtime = context?.worldLoadRuntimeState;
  const publication = context?.worldPublication;
  return context?.initialEarthWorldReady === true && !context.worldLoading &&
    runtime?.status === 'ready' && runtime.geometryReady === true &&
    runtime.gameplayRuntimesReady === true && runtime.session?.state === 'published' &&
    !!publication && runtime.publication === publication &&
    publication.sequence === context._worldLoadSequence &&
    publication.sequence === runtime.sequence &&
    publication.requestId === runtime.session.requestId;
}
