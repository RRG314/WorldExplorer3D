const canonicalJson = value => `${JSON.stringify(value, null, 2)}\n`;
export function firebaseProjectScript(environment, config) {
  return `window.WORLD_EXPLORER_FIREBASE_ENV = ${JSON.stringify(environment)};\n` +
    `window.WORLD_EXPLORER_FIREBASE = window.WORLD_EXPLORER_FIREBASE || ${JSON.stringify(config, null, 2)};\n`;
}
export function firebaseInitJson(config) {
  return canonicalJson(Object.fromEntries(['apiKey', 'appId', 'authDomain', 'measurementId',
    'messagingSenderId', 'projectId', 'storageBucket'].map(key => [key, String(config[key] || '')])));
}
export function generatedFirebaseFiles(environment, config) {
  return { 'js/firebase-project-config.js': firebaseProjectScript(environment, config),
    '__/firebase/init.json': firebaseInitJson(config),
    '__/firebase/init.js': `self.__FIREBASE_DEFAULTS__ = ${firebaseInitJson(config).trim()};\n` };
}
