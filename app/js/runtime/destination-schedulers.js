const schedulerFactories = new Map();

function registerDestinationScheduler(destination, factory) {
  const normalizedDestination = String(destination || '').trim();
  if (!normalizedDestination) {
    throw new TypeError('Destination scheduler registration requires a destination.');
  }
  if (typeof factory !== 'function') {
    throw new TypeError(`Destination scheduler ${normalizedDestination} requires a factory.`);
  }
  if (schedulerFactories.has(normalizedDestination)) {
    throw new Error(`Destination scheduler already registered: ${normalizedDestination}`);
  }
  schedulerFactories.set(normalizedDestination, factory);
  return () => schedulerFactories.get(normalizedDestination) === factory
    && schedulerFactories.delete(normalizedDestination);
}

function createDestinationScheduler(context = {}) {
  const destination = String(context.destination || '').trim();
  const factory = schedulerFactories.get(destination);
  if (!factory) return null;
  const scheduler = factory(Object.freeze({ ...context, destination }));
  if (!scheduler || typeof scheduler.start !== 'function' || typeof scheduler.stop !== 'function') {
    throw new TypeError(
      `Destination scheduler ${destination} must provide start() and stop().`
    );
  }
  return scheduler;
}

function getDestinationSchedulerRegistrySnapshot() {
  return Object.freeze({
    destinations: [...schedulerFactories.keys()],
    registered: schedulerFactories.size
  });
}

export {
  createDestinationScheduler,
  getDestinationSchedulerRegistrySnapshot,
  registerDestinationScheduler
};
