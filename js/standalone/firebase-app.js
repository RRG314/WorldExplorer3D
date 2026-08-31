const apps = [];

export function initializeApp(options = {}, name = '[DEFAULT]') {
  const app = Object.freeze({ name, options: Object.freeze({ ...options }) });
  apps.push(app);
  return app;
}

export function getApps() {
  return apps.slice();
}

export function getApp(name = '[DEFAULT]') {
  const app = apps.find((candidate) => candidate.name === name);
  if (!app) throw new Error(`Firebase app ${name} is unavailable in standalone mode.`);
  return app;
}
