import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createRng, DEFAULT_CONFIG } from '@afterdark/shared';
import { io as connect } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createServer, type GameServer } from '../src/app';
import { createLogger } from '../src/logger';
import { rngCodeSource } from '../src/rooms/lobbyCode';
import { isSameOrigin } from '../src/web';
import { waitFor } from './helpers';

const FILLER = '<p>afterdark</p>'.repeat(300); // big enough for gzip to kick in
const INDEX_HTML = `<!doctype html><html><body><div id="root"></div>${FILLER}</body></html>`;

describe('production web layer', () => {
  let dir: string;
  let server: GameServer;
  let url: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'afterdark-client-'));
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(path.join(dir, 'index.html'), INDEX_HTML);
    writeFileSync(path.join(dir, 'assets', 'index-AbC123.js'), 'console.log(1);');
    writeFileSync(path.join(dir, 'sw.js'), '// service worker');
    writeFileSync(path.join(dir, 'favicon.svg'), '<svg/>');
    server = createServer({
      logger: createLogger({ level: 'silent', pretty: false }),
      now: () => Date.now(),
      version: { sha: 'abc1234' },
      allowTestMode: true,
      clientDir: dir,
      codeSource: rngCodeSource(createRng(3)),
    });
    await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
    url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html at / with no-cache and a CSP that allows OSM tiles and no third-party fonts or styles', async () => {
    const res = await fetch(url, { headers: { 'accept-encoding': 'identity' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('https://tile.openstreetmap.org');
    expect(csp).not.toContain('googleapis');
    expect(csp).not.toContain('gstatic');
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('gives hashed assets an immutable year of caching and revalidates the service worker', async () => {
    const asset = await fetch(`${url}/assets/index-AbC123.js`);
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const sw = await fetch(`${url}/sw.js`);
    expect(sw.headers.get('cache-control')).toBe('no-cache');
    const icon = await fetch(`${url}/favicon.svg`);
    expect(icon.headers.get('cache-control')).toMatch(/max-age=3600/);
  });

  it('falls back to index.html for app routes but returns a real 404 for a missing file', async () => {
    const route = await fetch(`${url}/lobby/ABC234`);
    expect(route.status).toBe(200);
    expect(await route.text()).toContain('id="root"');
    expect((await fetch(`${url}/assets/missing-123.js`)).status).toBe(404);
    expect((await fetch(`${url}/socket.io/no-such-thing`)).status).not.toBe(200);
  });

  it('compresses large responses and keeps the API routes (with security headers)', async () => {
    const res = await fetch(url, { headers: { 'accept-encoding': 'gzip' } });
    expect(res.headers.get('content-encoding')).toBe('gzip');
    const health = await fetch(`${url}/health`);
    expect(await health.json()).toEqual({ ok: true });
    expect(health.headers.get('content-security-policy')).not.toBeNull();
    const version = await fetch(`${url}/version`);
    expect(await version.json()).toEqual({ sha: 'abc1234' });
  });

  it('accepts a same-origin WebSocket and refuses a foreign Origin', async () => {
    const host = new URL(url).host;
    const ok = connect(url, {
      transports: ['websocket'],
      extraHeaders: { origin: `http://${host}` },
    });
    await waitFor(() => ok.connected, 'same-origin connect');
    ok.close();

    const evil = connect(url, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { origin: 'https://evil.example' },
    });
    const err = await new Promise<Error>((resolve) => evil.once('connect_error', resolve));
    expect(err).toBeInstanceOf(Error);
    expect(evil.connected).toBe(false);
    evil.close();
  });

  it('tells every client the server is restarting, then closes', async () => {
    const client = connect(url, { transports: ['websocket'], reconnection: false });
    await waitFor(() => client.connected, 'connect');
    const got = new Promise<{ reason: string }>((resolve) =>
      client.once('server:shutdown', resolve),
    );
    const startedAt = Date.now();
    await server.shutdown();
    expect(await got).toEqual({ reason: 'restart' });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(DEFAULT_CONFIG.shutdownNoticeMs - 50);
    client.close();
  });
});

describe('isSameOrigin', () => {
  it('lets requests with no Origin through (bots, curl, same-origin GETs)', () => {
    expect(isSameOrigin(undefined, 'afterdark.onrender.com')).toBe(true);
  });
  it('matches the host, including the port', () => {
    expect(isSameOrigin('https://afterdark.onrender.com', 'afterdark.onrender.com')).toBe(true);
    expect(isSameOrigin('http://localhost:5173', 'localhost:5173')).toBe(true);
    expect(isSameOrigin('http://localhost:5173', 'localhost:3000')).toBe(false);
  });
  it('rejects another site and garbage', () => {
    expect(isSameOrigin('https://evil.example', 'afterdark.onrender.com')).toBe(false);
    expect(isSameOrigin('null', 'afterdark.onrender.com')).toBe(false);
  });
});
