#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const envName = String(process.argv[2] || process.env.WE3D_FIREBASE_ENV || 'production').trim().toLowerCase();
const configMap = {
  production: 'config/firebase.production.json',
  staging: 'config/firebase.staging.json'
};

function assertKnownEnv(name) {
  if (!configMap[name]) {
    throw new Error(`Unknown Firebase environment "${name}". Expected one of: ${Object.keys(configMap).join(', ')}`);
  }
}

function buildProjectConfigScript(env, config) {
  return `window.WORLD_EXPLORER_FIREBASE_ENV = ${JSON.stringify(env)};\n` +
    `window.WORLD_EXPLORER_FIREBASE = window.WORLD_EXPLORER_FIREBASE || ${JSON.stringify(config, null, 2)};\n`;
}

function buildInitJson(config) {
  const payload = {
    apiKey: String(config.apiKey || ''),
    appId: String(config.appId || ''),
    authDomain: String(config.authDomain || ''),
    measurementId: String(config.measurementId || ''),
    messagingSenderId: String(config.messagingSenderId || ''),
    projectId: String(config.projectId || ''),
    storageBucket: String(config.storageBucket || '')
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function buildInitJs(config) {
  return `self.__FIREBASE_DEFAULTS__ = ${buildInitJson(config).trim()};\n`;
}

async function writeFile(targetPath, content) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf8');
}

async function main() {
  assertKnownEnv(envName);
  const configPath = path.join(rootDir, configMap[envName]);
  const raw = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(raw);

  const projectConfigScript = buildProjectConfigScript(envName, config);
  const initJson = buildInitJson(config);
  const initJs = buildInitJs(config);

  const writes = [
    writeFile(path.join(rootDir, 'js/firebase-project-config.js'), projectConfigScript),
    writeFile(path.join(rootDir, 'public/js/firebase-project-config.js'), projectConfigScript),
    writeFile(path.join(rootDir, 'public/__/firebase/init.json'), initJson),
    writeFile(path.join(rootDir, 'public/__/firebase/init.js'), initJs)
  ];

  await Promise.all(writes);

  console.log(JSON.stringify({
    ok: true,
    environment: envName,
    projectId: config.projectId,
    outputs: [
      'js/firebase-project-config.js',
      'public/js/firebase-project-config.js',
      'public/__/firebase/init.json',
      'public/__/firebase/init.js'
    ]
  }, null, 2));
}

main().catch((err) => {
  console.error('[apply-firebase-config] Failed:', err?.stack || err?.message || String(err));
  process.exit(1);
});
