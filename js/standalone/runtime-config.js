(function configureStandaloneEdition() {
  const standalone = Object.freeze({
    enabled: true,
    mode: 'standalone',
    firebaseEnabled: false,
    cloudFeatures: false
  });

  window.WORLD_EXPLORER_FIREBASE_ENV = 'standalone';
  window.WORLD_EXPLORER_FIREBASE = null;
  window.WORLD_EXPLORER_FIREBASE_EMULATORS = null;
  window.WORLD_EXPLORER_STANDALONE = standalone;
  document.documentElement.dataset.runtimeMode = 'standalone';

  const importMap = document.createElement('script');
  importMap.type = 'importmap';
  importMap.textContent = JSON.stringify({
    imports: {
      'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js': '/js/standalone/firebase-app.js',
      'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js': '/js/standalone/firebase-auth.js',
      'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js': '/js/standalone/firebase-firestore.js',
      'https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js': '/js/standalone/firebase-analytics.js'
    }
  });
  document.currentScript.after(importMap);
})();
