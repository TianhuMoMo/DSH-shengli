/**
 * 鲸鱼娘生理拓展 —— Host 半
 *
 * 职责:
 *  1. 订阅会话事件,把 tokens 消耗与对话时长喂给生理状态机;
 *  2. 定时推进(自然吸收 / 性压抑 / 高潮消退),状态落盘到插件目录 data/state.json;
 *  3. 通过 /api/whale-utero/* 把状态与设置面向前端 UI 暴露。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createState,
  hydrate,
  tick,
  noteActivity,
  noteUsage,
  viewOf,
  applySettings,
  previewEvent,
} from './lib/state.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const ART_FILE = path.join(HERE, 'ZG1.jpg');
const API_ROOT = '/api/whale-utero';

const TICK_MS = 5000;

/* ------------------------------------------------------------------ 存储 */

function readState(now) {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return { state: hydrate(JSON.parse(raw), now), existed: true };
  } catch {
    return { state: createState(now), existed: false };
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

/* ------------------------------------------------------------------ HTTP */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        resolve('');
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

async function readJsonBody(req) {
  const text = await readBody(req);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ 插件 */

export function apply(ctx) {
  const now = Date.now();
  const loaded = readState(now);
  const state = loaded.state;
  let dirty = !loaded.existed;
  let pumping = false;

  const flush = () => {
    if (!dirty) return;
    dirty = false;
    try {
      writeState(state);
    } catch (error) {
      console.error('[whale-utero] 状态落盘失败:', error && error.message ? error.message : error);
    }
  };

  const pump = (at = Date.now()) => {
    if (pumping) return;
    pumping = true;
    try {
      tick(state, at);
      dirty = true;
    } finally {
      pumping = false;
    }
  };

  /* 定时推进,让关掉页面也继续吸收 / 累计 */
  ctx.effect(() => {
    const timer = setInterval(() => {
      pump();
    }, TICK_MS);
    const saver = setInterval(flush, 2000);
    return () => {
      clearInterval(timer);
      clearInterval(saver);
      flush();
    };
  });

  /* ---------------- 会话事件 → 生理状态 ---------------- */

  let lastStreamTouch = 0;

  ctx.on('session/event', (_session, event) => {
    if (!event || typeof event !== 'object') return;
    const at = Number.isFinite(event.time) ? event.time : Date.now();
    switch (event.type) {
      case 'turn/start':
      case 'user/message':
        noteActivity(state, at);
        break;
      case 'assistant/message': {
        noteActivity(state, at);
        const usage = event.data && event.data.usage;
        if (usage) noteUsage(state, at, usage);
        break;
      }
      default:
        break;
    }
    pump(at);
  });

  /* 模型持续出字时保持"这段对话还活着",否则长时间思考会被判成空闲 */
  ctx.on('agent/assistant-stream', () => {
    const at = Date.now();
    if (at - lastStreamTouch < 5000) return;
    lastStreamTouch = at;
    noteActivity(state, at);
    dirty = true;
  });

  /* ---------------- HTTP 路由 ---------------- */

  const views = () => {
    const at = Date.now();
    pump(at);
    return viewOf(state, at);
  };

  const routes = [
    {
      kind: 'exact',
      path: `${API_ROOT}/art`,
      handler: (req, res) => {
        let data;
        try {
          data = fs.readFileSync(ART_FILE);
        } catch {
          res.statusCode = 404;
          res.setHeader('content-type', 'text/plain; charset=utf-8');
          res.end('art-not-found');
          return;
        }
        res.statusCode = 200;
        res.setHeader('content-type', 'image/jpeg');
        res.setHeader('cache-control', 'public, max-age=60');
        res.setHeader('content-length', String(data.length));
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        res.end(data);
      },
    },
    {
      kind: 'exact',
      path: `${API_ROOT}/state`,
      handler: (req, res) => {
        sendJson(res, 200, views());
      },
    },
    {
      kind: 'exact',
      path: `${API_ROOT}/settings`,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
          return;
        }
        const body = await readJsonBody(req);
        const result = applySettings(state, body.settings || body);
        dirty = true;
        flush();
        sendJson(res, 200, { ...views(), rejected: result.rejected });
      },
    },
    {
      kind: 'exact',
      path: `${API_ROOT}/reset`,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
          return;
        }
        const at = Date.now();
        const fresh = createState(at);
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, fresh);
        dirty = true;
        flush();
        sendJson(res, 200, viewOf(state, at));
      },
    },
    {
      kind: 'exact',
      path: `${API_ROOT}/preview`,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
          return;
        }
        const body = await readJsonBody(req);
        const at = Date.now();
        previewEvent(state, at, body);
        dirty = true;
        flush();
        sendJson(res, 200, viewOf(state, at));
      },
    },
    {
      kind: 'exact',
      path: `${API_ROOT}/tts-test`,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
          return;
        }
        const endpoint = String(state.settings.ttsEndpoint || '').trim();
        if (!endpoint) {
          sendJson(res, 400, { ok: false, error: 'empty-endpoint' });
          return;
        }
        const at = Date.now();
        const view = viewOf(state, at);
        const payload = {
          voice: state.settings.ttsVoice,
          emotion: view.voice.emotion,
          style: view.voice.style,
          params: view.voice.params,
          text: '主人……鲸鱼娘现在有点难受。',
        };
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          sendJson(res, 200, { ok: response.ok, status: response.status, sent: payload });
        } catch (error) {
          sendJson(res, 502, { ok: false, error: error && error.message ? error.message : String(error) });
        }
      },
    },
  ];

  /* ---------------- 注册 / 诊断 / 页面注入 ---------------- */

  const bootLog = [];

  const writeBoot = (entry) => {
    bootLog.push({ at: Date.now(), ...entry });
    if (bootLog.length > 24) bootLog.splice(0, bootLog.length - 24);
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(DATA_DIR, 'boot.json'),
        JSON.stringify({ plugin: 'dsh-whale-utero', entries: bootLog }, null, 2),
        'utf8',
      );
    } catch {
      /* 诊断文件写不进去不影响主功能 */
    }
  };

  const resolveApiInfo = () => {
    const info = { base: API_ROOT, origin: '', query: '', tokenized: '' };
    let ws;
    try {
      ws = ctx.get('webServer');
    } catch {
      ws = undefined;
    }
    try {
      if (ws && typeof ws.getOrigin === 'function') info.origin = ws.getOrigin();
    } catch {
      info.origin = '';
    }
    if (!info.origin) return info;
    try {
      const connection = ctx.get('connection');
      if (!connection || typeof connection.authenticatedUrl !== 'function') return info;
      const tokenized = connection.authenticatedUrl(`${info.origin}${API_ROOT}`);
      if (!tokenized) return info;
      info.tokenized = tokenized;
      info.query = new URL(tokenized).search || '';
    } catch {
      /* 认证不可用:退回同源无 token 请求 */
    }
    return info;
  };

  let routeDispose = null;

  const attachRoutes = () => {
    if (routeDispose) return;
    let ws;
    try {
      ws = ctx.get('webServer');
    } catch {
      ws = undefined;
    }
    if (!ws || typeof ws.register !== 'function') {
      writeBoot({ step: 'attach', registered: false, reason: 'webServer-not-ready' });
      return;
    }
    try {
      const disposers = routes.map((route) => ws.register(route));
      routeDispose = () => {
        for (const dispose of disposers) {
          try {
            dispose();
          } catch {
            /* 路由已随宿主卸载 */
          }
        }
      };
      writeBoot({
        step: 'attach',
        registered: true,
        routes: routes.map((route) => route.path),
        api: resolveApiInfo(),
      });
    } catch (error) {
      writeBoot({
        step: 'attach',
        registered: false,
        reason: 'register-threw',
        error: String((error && error.message) || error),
      });
    }
  };

  // 立即尝试;若此刻 webServer 还没就绪,等它上线再补注册(这正是上次失效的坑)
  attachRoutes();
  try {
    ctx.inject(['webServer'], () => {
      attachRoutes();
    });
  } catch {
    /* 老版本没有 ctx.inject,靠定时器兜底 */
    ctx.effect(() => {
      const timer = setInterval(() => {
        attachRoutes();
        if (routeDispose) clearInterval(timer);
      }, 2000);
      return () => clearInterval(timer);
    });
  }

  ctx.effect(() => () => {
    if (routeDispose) routeDispose();
  });

  /* 把带认证 token 的查询串注入页面:浏览器同源请求需要它才不会被 401 挡掉 */
  ctx.on('webserver/index-inject', (table) => {
    if (!Array.isArray(table)) return;
    try {
      const info = resolveApiInfo();
      const payload = { v: 1, base: API_ROOT, query: info.query || '' };
      table.push({
        kind: 'script',
        placement: 'head',
        text: `window.__DSH_WHALE_UTERO__=${JSON.stringify(payload)};`,
      });
    } catch {
      /* 注入失败不影响其它插件 */
    }
  });
}
