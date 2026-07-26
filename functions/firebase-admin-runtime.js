const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, Timestamp, getFirestore } = require('firebase-admin/firestore');

function ensureApp() {
  return getApps()[0] || initializeApp();
}

function firestore() {
  return getFirestore(ensureApp());
}
firestore.FieldValue = FieldValue;
firestore.Timestamp = Timestamp;

function auth() {
  return getAuth(ensureApp());
}

module.exports = {
  auth,
  firestore,
  initializeApp: ensureApp,
  get apps() {
    return getApps();
  }
};
