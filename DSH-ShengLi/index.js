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

  const webServer = ctx.get('webServer');
  if (!webServer || typeof webServer.register !== 'function') {
    ctx.logger?.warn?.('[whale-utero] 没有 webServer 服务,页面数据接口未注册');
    return;
  }

  const views = () => {
    const at = Date.now();
    pump(at);
    return viewOf(state, at);
  };

  const routes = [
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

  ctx.effect(() => {
    const disposers = routes.map((route) => webServer.register(route));
    return () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          /* 路由已随宿主卸载 */
        }
      }
    };
  });
}
