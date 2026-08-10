#!/usr/bin/env node
/**
 * Local mobile testing helper:
 * 1) starts the Nest backend on port 3000
 * 2) opens a temporary Cloudflare quick tunnel
 * 3) prints a single public URL for phone testing
 *
 * Does not change API behavior. Dev/testing only.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bin, install, Tunnel } from 'cloudflared';

const PORT = 3000;
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_FILE = join(ROOT, '.mobile-url');
const READY_TIMEOUT_MS = 120_000;

/** @type {import('node:child_process').ChildProcess | null} */
let backend = null;
/** @type {Tunnel | null} */
let tunnel = null;
let shuttingDown = false;

function log(message) {
  console.log(message);
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function waitForPort(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await canConnect(port)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for backend on port ${port}`);
}

async function ensureCloudflaredBinary() {
  if (!existsSync(bin)) {
    log('Installing cloudflared binary (one-time)...');
    await install(bin);
  }
}

function startBackend() {
  log(`Starting backend on port ${PORT}...`);
  backend = spawn('npm', ['run', 'start:dev'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backend.stdout.on('data', (chunk) => process.stdout.write(chunk));
  backend.stderr.on('data', (chunk) => process.stderr.write(chunk));
  backend.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(
        `Backend exited unexpectedly (code=${code}, signal=${signal}).`,
      );
      shutdown(1);
    }
  });
}

async function startTunnel() {
  log('Opening Cloudflare development tunnel...');
  tunnel = Tunnel.quick(LOCAL_URL);

  tunnel.on('error', (error) => {
    console.error('Tunnel error:', error);
  });

  const publicUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for Cloudflare tunnel URL'));
    }, READY_TIMEOUT_MS);

    tunnel.once('url', (url) => {
      clearTimeout(timer);
      resolve(url);
    });

    tunnel.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`cloudflared exited before ready (code=${code})`));
    });
  });

  return publicUrl.replace(/\/$/, '');
}

function printPublicUrl(publicUrl) {
  const docsUrl = `${publicUrl}/docs`;
  writeFileSync(URL_FILE, `${docsUrl}\n`, 'utf8');

  log('');
  log('============================================================');
  log('Mobile test URL (open in Chrome on your phone):');
  log(docsUrl);
  log('============================================================');
  log(`Also written to ${URL_FILE}`);
  log('Press Ctrl+C to stop backend + tunnel.');
  log('');
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  try {
    if (existsSync(URL_FILE)) {
      unlinkSync(URL_FILE);
    }
  } catch {
    // ignore cleanup failures
  }

  try {
    tunnel?.stop();
  } catch {
    // ignore
  }

  if (backend && !backend.killed) {
    backend.kill('SIGTERM');
  }

  setTimeout(() => process.exit(exitCode), 300).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  if (await canConnect(PORT)) {
    throw new Error(
      `Port ${PORT} is already in use. Stop the other process, then rerun npm run dev:mobile.`,
    );
  }

  await ensureCloudflaredBinary();
  startBackend();
  await waitForPort(PORT, READY_TIMEOUT_MS);

  const publicUrl = await startTunnel();
  printPublicUrl(publicUrl);

  // Keep the process alive while children run.
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
});
