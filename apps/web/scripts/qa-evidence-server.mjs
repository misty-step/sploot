#!/usr/bin/env node

/**
 * Loopback-only front door for authenticated gallery evidence.
 *
 * The browser never talks directly to the standalone Next process. This
 * server observes the TCP peer address, rejects non-loopback peers, strips
 * any client-supplied proof address, and forwards the observed address in an
 * internal request header. The app still requires the signed, short-lived
 * principal bound to the allowlisted deployment and audience.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import process from 'node:process';

const publicPort = Number(process.env.PORT ?? 3474);
const appPort = Number(process.env.QA_NEXT_PORT ?? publicPort + 1);
const appHost = '127.0.0.1';
const lifecyclePath = process.env.QA_EVIDENCE_LIFECYCLE_PATH;
const lifecycle = {
  command: `${process.execPath} .next/standalone/apps/web/server.js`,
  frontDoorCommand: `${process.execPath} scripts/qa-evidence-server.mjs`,
  publicUrl: `http://${appHost}:${publicPort}`,
  publicHost: appHost,
  appHost,
  publicPort,
  appPort,
  startedAt: new Date().toISOString(),
  frontDoorPid: process.pid,
  appPid: null,
  teardown: null,
};
const writeLifecycle = () => {
  if (!lifecyclePath) return;
  writeFileSync(lifecyclePath, `${JSON.stringify(lifecycle, null, 2)}\n`);
};
const appServer = spawn(process.execPath, ['.next/standalone/apps/web/server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(appPort), HOSTNAME: appHost },
  stdio: 'inherit',
});
lifecycle.appPid = appServer.pid ?? null;
writeLifecycle();

const isLoopback = (address) => {
  const normalized = String(address ?? '').toLowerCase().replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1';
};

const hostName = (value) => {
  const raw = String(value ?? '').split(',')[0].trim();
  if (raw.startsWith('[')) return raw.slice(1, raw.indexOf(']'));
  return raw.split(':')[0];
};

const server = http.createServer((request, response) => {
  const remoteAddress = request.socket.remoteAddress;
  const host = hostName(request.headers.host);
  if (!isLoopback(remoteAddress) || !isLoopback(host)) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('loopback evidence server only');
    return;
  }

  const headers = { ...request.headers };
  delete headers['x-sploot-qa-remote-address'];
  headers.host = request.headers.host;
  headers['x-sploot-qa-remote-address'] = remoteAddress.replace(/^::ffff:/, '');

  const upstream = http.request({
    hostname: appHost,
    port: appPort,
    method: request.method,
    path: request.url,
    headers,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.pipe(upstream);
});

server.on('upgrade', (_request, socket) => socket.destroy());
server.listen(publicPort, appHost, () => {
  writeLifecycle();
  console.log(`[qa-evidence-server] loopback front door http://${appHost}:${publicPort} -> ${appHost}:${appPort}`);
});

const shutdown = (signal = 'unknown') => {
  if (lifecycle.teardown) return;
  lifecycle.teardown = { signal, at: new Date().toISOString() };
  writeLifecycle();
  server.close();
  appServer.kill('SIGTERM');
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
appServer.on('exit', (code) => {
  if (!lifecycle.teardown) shutdown('standalone-exit');
  lifecycle.appExit = { code, at: new Date().toISOString() };
  writeLifecycle();
  if (code && code !== 143) process.exitCode = code;
});
