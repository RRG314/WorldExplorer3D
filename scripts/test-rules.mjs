#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FIRESTORE_RULE_TEST_SCRIPT = 'node tests/firestore.rules.security.test.mjs';
const PATH_SEPARATOR = process.platform === 'win32' ? ';' : ':';
const JAVA_BIN_NAME = process.platform === 'win32' ? 'java.exe' : 'java';

function runCommand(cmd, args, extraEnv = null) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: false,
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env
    });

    child.on('error', (error) => {
      resolve({ code: 1, error });
    });

    child.on('exit', (code) => {
      resolve({ code: Number.isInteger(code) ? code : 1, error: null });
    });
  });
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function resolveJava() {
  const javaHome = String(process.env.JAVA_HOME || '').trim();
  if (javaHome) {
    const javaFromHome = path.join(javaHome, 'bin', JAVA_BIN_NAME);
    if (fileExists(javaFromHome)) {
      return {
        javaCmd: javaFromHome,
        javaHome,
        javaBinDir: path.dirname(javaFromHome)
      };
    }
  }

  if (process.platform === 'darwin') {
    const macCandidates = [
      '/opt/homebrew/opt/openjdk@21/bin/java',
      '/usr/local/opt/openjdk@21/bin/java'
    ];
    for (const candidate of macCandidates) {
      if (fileExists(candidate)) {
        return {
          javaCmd: candidate,
          javaHome: path.dirname(path.dirname(candidate)),
          javaBinDir: path.dirname(candidate)
        };
      }
    }
  }

  return {
    javaCmd: 'java',
    javaHome: javaHome || null,
    javaBinDir: null
  };
}

function javaEnv(javaInfo) {
  const extra = {};
  if (javaInfo.javaHome) extra.JAVA_HOME = javaInfo.javaHome;
  if (javaInfo.javaBinDir) {
    extra.PATH = process.env.PATH
      ? `${javaInfo.javaBinDir}${PATH_SEPARATOR}${process.env.PATH}`
      : javaInfo.javaBinDir;
  }
  return extra;
}

async function hasJava(javaInfo) {
  const result = await runCommand(javaInfo.javaCmd, ['-version'], javaEnv(javaInfo));
  if (result.error) {
    if (result.error.code === 'ENOENT') return false;
    return false;
  }
  return result.code === 0;
}

function printJavaInstallHelp() {
  console.error('\nJava is required to run the Firestore emulator.');
  console.error('Install free OpenJDK and retry:\n');
  console.error('- macOS (Homebrew): brew install openjdk@21');
  console.error('- Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y openjdk-21-jre');
  console.error('- Windows (winget): winget install EclipseAdoptium.Temurin.21.JRE\n');
}

async function runWithFirebaseCli() {
  const javaInfo = resolveJava();
  const env = javaEnv(javaInfo);
  const direct = await runCommand('firebase', [
    'emulators:exec',
    '--only',
    'firestore',
    FIRESTORE_RULE_TEST_SCRIPT
  ], env);

  if (!direct.error || direct.error.code !== 'ENOENT') {
    return direct.code;
  }

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const fallback = await runCommand(npxCmd, [
    '--yes',
    'firebase-tools',
    'emulators:exec',
    '--only',
    'firestore',
    FIRESTORE_RULE_TEST_SCRIPT
  ], env);

  if (fallback.error && fallback.error.code === 'ENOENT') {
    console.error('\nCould not find `firebase` CLI or `npx` on PATH.');
    console.error('Install Node.js and firebase-tools, then rerun `npm test`.\n');
    return 1;
  }

  return fallback.code;
}

async function main() {
  const javaReady = await hasJava(resolveJava());
  if (!javaReady) {
    printJavaInstallHelp();
    process.exit(1);
  }

  const exitCode = await runWithFirebaseCli();
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
