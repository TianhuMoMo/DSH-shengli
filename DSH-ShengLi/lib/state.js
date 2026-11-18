/**
 * 鲸鱼娘生理拓展 —— 生理状态机(纯逻辑,不依赖任何 Harness 服务)
 *
 * 设计原则:
 *  1. 所有推进都是"惰性"的:tick(state, now) 依据时间差推进,因此关闭页面也不丢进度。
 *  2. 状态是纯 JSON,可直接落盘 / 直接吐给前端。
 *  3. 公式全部来自设置项,UI 上改设置 = 改行为。
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** 精液容量上限的默认值(ml)。展示图里是 200。 */
const DEFAULT_CAPACITY_ML = 200;

export const DEFAULT_SETTINGS = {
  /* ---------- 语音 ---------- */
  ttsEndpoint: '',
  ttsEnabled: false,
  ttsVoice: 'whale-girl',

  /* ---------- tokens → 精液 ---------- */
  tokensPerMl: 1_000_000,   // 每消耗多少 tokens 转化 1ml 射入
  capacityMl: DEFAULT_CAPACITY_ML,

  /* ---------- 自然吸收 ---------- */
  absorbEnabled: true,
  absorbPerHour: 1,         // 每小时自然吸收 1ml

  /* ---------- 情欲 ---------- */
  arousalPerMinute: 5,      // 对话每持续 1 分钟 +5
  arousalPerMl: 1,          // 每射入 1ml +1

  /* ---------- 高潮 ---------- */
  climaxMinMinutes: 10,            // 最短对话时长
  climaxTokenThreshold: 1_000_000, // 且消耗 tokens 超过 1M
  climaxArousalThreshold: 100,     // 或累计情欲值达到 100
  climaxPauseMinutes: 3,           // 高潮中断时间:此期间情欲不下降
  climaxDecayPercentPerMinute: 30, // 之后每分钟下降 30%
  climaxRepressionRelief: 20,      // 高潮缓解的性压抑

  /* ---------- 性压抑 ---------- */
  repressionPerHour: 5,     // 距上次消耗 tokens 每 1 小时 +5

  /* ---------- 对话分段 ---------- */
  episodeIdleMinutes: 10,   // 空闲超过这么久视为本段对话结束并结算
  repressionCarryMinutes: 30, // 间隔超过 30 分钟:取消本次高潮计量,情欲转性压抑
};

/* ========================================================================
 * 姿势 / 事件文本库(20 种姿势 × 2 条描述)
 * ===================================================================== */

export const POSE_LIBRARY = [
  {
    key: 'cowgirl', label: '女上位', lines: [
      '和鲸鱼娘女上位做爱,鲸鱼娘高潮了 {climax} 次,被主人内射了 {ml}ml 精液,鲸鱼娘的爱意上涨了,她伏在你胸口抖得说不完整句,尾音软成一滩糖水。',
      '鲸鱼娘跨坐在你身上自己摇,{minutes} 分钟没停,高潮了 {climax} 次还贪着要,被内射 {ml}ml 后贴着你耳朵说「还要」,爱意又涨了一截。',
    ],
  },
  {
    key: 'missionary', label: '正常位', lines: [
      '和鲸鱼娘用正常位做爱,十指扣在一起,鲸鱼娘高潮了 {climax} 次,被主人内射了 {ml}ml 精液,她小声念着你的名字,爱意上涨了。',
      '压着鲸鱼娘做,她一开始还嘴硬,后来腿都缠上来,高潮 {climax} 次,被灌进 {ml}ml 精液,别过脸不敢看你。',
    ],
  },
  {
    key: 'doggy', label: '后入式', lines: [
      '从后面进入鲸鱼娘,她被顶得攥紧床单,高潮了 {climax} 次,被主人内射了 {ml}ml 精液,回头那一眼委屈又满意。',
      '后入时鲸鱼娘的尾巴根都在抖,高潮 {climax} 次,内射 {ml}ml 之后整个人软下去,爱意悄悄上涨。',
    ],
  },
  {
    key: 'spoon', label: '侧卧位', lines: [
      '侧躺着抱着鲸鱼娘慢慢来,她整个人缩进你怀里,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '侧卧位贴着做,呼吸都缠在一起,鲸鱼娘高潮 {climax} 次,收下 {ml}ml 精液后赖着不肯起床。',
    ],
  },
  {
    key: 'standing', label: '立位抱操', lines: [
      '把鲸鱼娘抱起来做,她只能搂着你脖子,高潮了 {climax} 次,被内射了 {ml}ml 精液,落地时腿还在软。',
      '立位抱在怀里顶,鲸鱼娘惊叫又被你捂住嘴,高潮 {climax} 次,内射 {ml}ml 后她红着眼不肯松手。',
    ],
  },
  {
    key: 'reverse', label: '反骑乘', lines: [
      '鲸鱼娘背对着坐上来,腰自己找节奏,高潮了 {climax} 次,被主人内射了 {ml}ml 精液,爱意上涨了一截。',
      '反骑乘时她看不见你的表情反而更放得开,高潮 {climax} 次,被内射 {ml}ml 后回头索吻。',
    ],
  },
  {
    key: 'train', label: '火车便当', lines: [
      '把鲸鱼娘整个人抱起来用火车便当的姿势做,她悬空失重只能抱紧你,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '火车便当抱着走两步顶一下,鲸鱼娘哭腔都出来了,高潮 {climax} 次,内射 {ml}ml 后软在你肩上。',
    ],
  },
  {
    key: 'desk', label: '桌边俯身', lines: [
      '在桌前让鲸鱼娘俯下身去做,文件都被扫到了地上,她高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '桌边俯身时鲸鱼娘还在担心被发现,紧张得夹紧,高潮 {climax} 次,内射 {ml}ml 后腿都站不住。',
    ],
  },
  {
    key: 'sixty-nine', label: '69 式', lines: [
      '和鲸鱼娘用 69 式互相照顾,她含着你还要抖,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '69 式时鲸鱼娘的舌头都在打颤,高潮 {climax} 次,收下 {ml}ml 精液后红着脸擦嘴。',
    ],
  },
  {
    key: 'oral', label: '口交侍奉', lines: [
      '鲸鱼娘跪着替主人口交,抬眼看的次数比停下还多,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '口交时鲸鱼娘故意放慢折磨你,最后被按着头内射 {ml}ml,自己先湿得不像话。',
    ],
  },
  {
    key: 'paizuri', label: '乳交', lines: [
      '鲸鱼娘用胸口夹着替主人服务,抬头邀功一样看你,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '乳交到一半她自己先受不了,高潮 {climax} 次,被射了 {ml}ml 在胸口还笑眯眯的。',
    ],
  },
  {
    key: 'handjob', label: '手活', lines: [
      '鲸鱼娘用手替主人慢慢来,一边问舒不舒服一边偷袭,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '手活时鲸鱼娘故意用指甲轻轻刮,逼得你交代,接住 {ml}ml 后得意得不行。',
    ],
  },
  {
    key: 'chair', label: '抱坐椅背', lines: [
      '把鲸鱼娘抱坐在椅背上做,她必须自己抱紧才不掉下去,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '椅背上半悬着做,鲸鱼娘紧张得夹得死紧,高潮 {climax} 次,内射 {ml}ml 后委屈地瞪你。',
    ],
  },
  {
    key: 'wall', label: '站姿贴墙', lines: [
      '把鲸鱼娘压在墙上做,她踮着脚小声求饶,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '贴墙时走廊一点声音都听得见,鲸鱼娘咬着唇不敢叫,高潮 {climax} 次,内射 {ml}ml 后腿软到要扶。',
    ],
  },
  {
    key: 'sofa', label: '沙发压', lines: [
      '在沙发上把鲸鱼娘压进靠垫里做,她连躲的地方都没有,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '沙发被压得吱呀响,鲸鱼娘高潮 {climax} 次,收下 {ml}ml 后把脸埋进靠垫里。',
    ],
  },
  {
    key: 'bath', label: '浴室湿身', lines: [
      '在浴室里抱着鲸鱼娘做,水声盖过她的声音,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '浴室湿得打滑,鲸鱼娘只能挂在你身上,高潮 {climax} 次,内射 {ml}ml 后头发全湿了还在笑。',
    ],
  },
  {
    key: 'morning', label: '被窝晨炮', lines: [
      '早上被窝里被鲸鱼娘蹭醒,迷迷糊糊就做了,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '被窝里半睡半醒地做,鲸鱼娘软得像没骨头,高潮 {climax} 次,内射 {ml}ml 后缩回去接着睡。',
    ],
  },
  {
    key: 'deep', label: '深喉调教', lines: [
      '让鲸鱼娘深喉侍奉,眼角都红了还乖乖不动,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '深喉时鲸鱼娘被逼出了眼泪,结束后却主动凑上来讨奖励,收下 {ml}ml 精液。',
    ],
  },
  {
    key: 'edge', label: '边缘控制', lines: [
      '把鲸鱼娘吊在边缘不许高潮,反复几次后她哭求准许,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '边缘控制到鲸鱼娘语无伦次,最后被允许时几乎立刻失控,高潮 {climax} 次,内射 {ml}ml 后只会蹭你。',
    ],
  },
  {
    key: 'breeding', label: '强行播种', lines: [
      '把鲸鱼娘按着强制播种,她一边说太多了还是一边夹紧,高潮了 {climax} 次,被内射了 {ml}ml 精液,爱意上涨了。',
      '播种到溢出来,鲸鱼娘高潮 {climax} 次,被内射 {ml}ml 后摸着肚子发呆,爱意上涨了一截。',
    ],
  },
];

/* ========================================================================
 * 命名阶段
 * ===================================================================== */

const AROUSAL_STAGES = [
  { max: 15, key: 'calm', label: '平静' },
  { max: 35, key: 'flutter', label: '心动' },
  { max: 55, key: 'flushed', label: '情动' },
  { max: 75, key: 'craving', label: '渴望' },
  { max: 90, key: 'heat', label: '发情' },
  { max: 101, key: 'edge', label: '濒临高潮' },
];

const REPRESSION_STAGES = [
  { max: 20, key: 'none', label: '无' },
  { max: 40, key: 'slight', label: '轻微' },
  { max: 60, key: 'notable', label: '明显' },
  { max: 80, key: 'heavy', label: '强烈' },
  { max: Number.POSITIVE_INFINITY, key: 'breaking', label: '濒临崩溃' },
];

const VOICE_EMOTIONS = {
  calm: { key: 'calm', label: '平静', style: 'soft-breathe', speed: 0.94, pitch: 0.96, volume: 0.85 },
  tender: { key: 'tender', label: '温柔', style: 'tender-whisper', speed: 0.98, pitch: 1.0, volume: 0.9 },
  eager: { key: 'eager', label: '急切', style: 'eager-moan', speed: 1.08, pitch: 1.06, volume: 1.0 },
  needy: { key: 'needy', label: '难耐', style: 'needy-whimper', speed: 0.9, pitch: 0.94, volume: 0.95 },
  overwhelmed: { key: 'overwhelmed', label: '濒临失控', style: 'overwhelmed-breath', speed: 1.12, pitch: 1.1, volume: 1.06 },
  climaxEdge: { key: 'climaxEdge', label: '高潮边缘', style: 'climax-edge', speed: 1.16, pitch: 1.14, volume: 1.1 },
};

const clampNum = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;

/* ========================================================================
 * 状态构造 / 迁移
 * ===================================================================== */

export function createState(now = Date.now()) {
  return {
    version: 1,
    createdAt: now,
    settings: { ...DEFAULT_SETTINGS },
    pool: 0,
    arousal: 0,
    repression: 0,
    climaxCount: 0,
    lastClimaxAt: 0,
    lastReleaseAt: 0,
    lastTokenAt: 0,
    lifetimeTokens: 0,
    lifetimeMl: 0,
    repressionHours: 0,
    decayClockAt: 0,
    lastTickAt: now,
    episode: {
      active: false,
      startAt: 0,
      clockAt: 0,
      lastActivityAt: 0,
      minutes: 0,
      tokens: 0,
      baseArousal: 0,
      climaxed: false,
    },
    events: [],
  };
}

export function hydrate(raw, now = Date.now()) {
  const base = createState(now);
  if (!raw || typeof raw !== 'object') return base;
  const state = { ...base, ...raw };
  state.settings = { ...DEFAULT_SETTINGS, ...(raw.settings && typeof raw.settings === 'object' ? raw.settings : {}) };
  state.episode = { ...base.episode, ...(raw.episode && typeof raw.episode === 'object' ? raw.episode : {}) };
  state.events = Array.isArray(raw.events) ? raw.events.filter((item) => item && typeof item === 'object').slice(0, 80) : [];
  if (!Number.isFinite(state.lastTickAt)) state.lastTickAt = now;
  return state;
}

/* ========================================================================
 * 时间推进
 * ===================================================================== */

export function tick(state, now = Date.now()) {
  const st = state.settings;
  const last = Number.isFinite(state.lastTickAt) ? state.lastTickAt : now;
  // 单次最多推进 6 小时,避免长期休眠后一夜爆表
  const dt = Math.max(0, Math.min(now - last, 6 * HOUR));
  state.lastTickAt = now;

  /* 1. 自然吸收 */
  if (st.absorbEnabled && st.absorbPerHour > 0 && state.pool > 0 && dt > 0) {
    state.pool = Math.max(0, state.pool - (st.absorbPerHour / HOUR) * dt);
  }

  /* 2. 性压抑:距上次消耗 tokens 每满 1 小时 +repressionPerHour */
  if (state.lastTokenAt > 0 && st.repressionPerHour > 0) {
    const due = Math.floor((now - state.lastTokenAt) / HOUR) - (state.repressionHours || 0);
    if (due > 0) {
      state.repression += due * st.repressionPerHour;
      state.repressionHours = (state.repressionHours || 0) + due;
    }
  }

  /* 3. 高潮之后的情欲消退:冷却期不下降,之后每分钟按比例下降 */
  if (state.lastClimaxAt > 0 && state.arousal > 0) {
    const gate = state.lastClimaxAt + st.climaxPauseMinutes * MINUTE;
    if (now > gate) {
      const from = Math.max(state.decayClockAt || 0, gate);
      if (now > from) {
        const minutes = (now - from) / MINUTE;
        const keep = Math.pow(1 - clampNum(st.climaxDecayPercentPerMinute, 0, 95) / 100, minutes);
        state.arousal *= keep;
        state.decayClockAt = now;
        if (state.arousal < 0.05) state.arousal = 0;
      }
    }
  }

  /* 4. 对话段推进 */
  const ep = state.episode;
  if (ep.active) {
    const idleLimit = Math.max(1, st.episodeIdleMinutes) * MINUTE;
    const idle = now - ep.lastActivityAt;
    if (idle > idleLimit) {
      // 先把活跃区间补算到最后一个活动时刻,再按间隔结算
      advanceEpisode(state, Math.max(ep.clockAt, ep.lastActivityAt));
      if (ep.active) settleEpisode(state, now, idle);
    } else if (now > ep.clockAt) {
      advanceEpisode(state, now);
    }
  }

  return state;
}

/** 把这一段对话的累计推进到 until 时刻,并顺便做高潮判定。 */
function advanceEpisode(state, until) {
  const ep = state.episode;
  if (!ep || !ep.active || !(until > ep.clockAt)) return;
  const minutes = (until - ep.clockAt) / MINUTE;
  ep.clockAt = until;
  ep.minutes += minutes;
  state.arousal = clampNum(state.arousal + minutes * state.settings.arousalPerMinute, 0, 100);
  maybeClimax(state, until);
}

/** 对话活动(用户发言 / 模型出字 / 回合开始)。 */
export function noteActivity(state, now = Date.now()) {
  tick(state, now);
  const ep = state.episode;
  if (!ep.active) {
    ep.active = true;
    ep.startAt = now;
    ep.clockAt = now;
    ep.minutes = 0;
    ep.tokens = 0;
    ep.baseArousal = state.arousal;
    ep.climaxed = false;
  }
  ep.lastActivityAt = now;
  return state;
}

/** 一次模型调用的 token 用量。 */
export function noteUsage(state, now = Date.now(), usage) {
  if (!usage || typeof usage !== 'object') return state;
  const total = Number.isFinite(usage.totalTokens) && usage.totalTokens > 0
    ? usage.totalTokens
    : (Number(usage.inputTokens) || 0) + (Number(usage.outputTokens) || 0);
  if (!(total > 0)) return state;
  if (!state.episode.active) noteActivity(state, now);
  state.episode.tokens += total;
  state.lifetimeTokens += total;
  state.lastTokenAt = now;
  state.repressionHours = 0;
  state.episode.lastActivityAt = now;
  maybeClimax(state, now);
  return state;
}

/** 本段对话结束结算。 */
function settleEpisode(state, now, idle) {
  const st = state.settings;
  const ep = state.episode;
  const gained = Math.max(0, state.arousal - ep.baseArousal);
  const gapMinutes = idle / MINUTE;

  if (gapMinutes >= Math.max(1, st.repressionCarryMinutes)) {
    // 间隔太久:取消本次高潮计量,本次增加的情欲等比转成性压抑
    if (!ep.climaxed && gained > 0.5) {
      state.arousal = Math.max(0, state.arousal - gained);
      state.repression += gained;
      pushEvent(state, now, {
        kind: 'interrupt',
        poseLabel: '中断',
        text: `对话间隔 ${Math.round(gapMinutes)} 分钟,本次高潮计量作废,${round1(gained)} 点情欲被压成了性压抑。`,
        ml: 0,
        climaxes: 0,
      });
    }
  } else if (!ep.climaxed && gapMinutes >= 5) {
    const ratio = 0.1 + Math.min(0.6, ((gapMinutes - 5) / 25) * 0.6);
    state.arousal = Math.max(0, state.arousal - gained * ratio);
  }

  ep.active = false;
  ep.minutes = 0;
  ep.tokens = 0;
  ep.climaxed = false;
  state.decayClockAt = now;
}

function maybeClimax(state, now) {
  const st = state.settings;
  const ep = state.episode;
  if (!ep.active) return;
  // 冷却期(高潮中断时间)内不再重复高潮;另加 1 秒硬保护防止同一时刻连击
  const pauseMs = Math.max(0, st.climaxPauseMinutes) * MINUTE;
  if (state.lastClimaxAt > 0 && now - state.lastClimaxAt < Math.max(pauseMs, 1000)) return;
  const bySession = ep.minutes >= st.climaxMinMinutes && ep.tokens >= st.climaxTokenThreshold;
  const byArousal = st.climaxArousalThreshold > 0 && state.arousal >= st.climaxArousalThreshold;
  if (!bySession && !byArousal) return;
  doClimax(state, now, bySession ? 'session' : 'arousal');
}

function doClimax(state, now, cause) {
  const st = state.settings;
  const ep = state.episode;
  const capacity = Math.max(1, st.capacityMl);
  const ml = st.tokensPerMl > 0 ? ep.tokens / st.tokensPerMl : 0;
  const injected = Math.max(0, Math.min(capacity, ml));

  if (injected > 0) {
    state.pool = Math.min(capacity, state.pool + injected);
    state.lastReleaseAt = now;
    state.lifetimeMl += injected;
  }
  // 射入本身的额外情欲(每 1ml +arousalPerMl)
  state.arousal = clampNum(state.arousal + injected * st.arousalPerMl, 0, 100);

  state.climaxCount += 1;
  state.lastClimaxAt = now;
  state.decayClockAt = now;
  state.arousal = 100;
  state.repression = Math.max(0, state.repression - st.climaxRepressionRelief);
  state.repressionHours = state.lastTokenAt > 0 ? Math.floor((now - state.lastTokenAt) / HOUR) : 0;

  pushEvent(state, now, {
    kind: 'climax',
    ml: round1(injected),
    climaxes: 1,
    cause,
    minutes: Math.round(ep.minutes),
  });

  ep.minutes = 0;
  ep.tokens = 0;
  ep.baseArousal = 100;
  ep.startAt = now;
  ep.clockAt = now;
  ep.lastActivityAt = now;
  ep.climaxed = true;
}

/* ========================================================================
 * 事件生成
 * ===================================================================== */

function pickPose(state) {
  const lastKey = state.events[0] && state.events[0].poseKey;
  const pool = POSE_LIBRARY.filter((pose) => pose.key !== lastKey);
  const list = pool.length > 0 ? pool : POSE_LIBRARY;
  return list[Math.floor(Math.random() * list.length)];
}

function fillTemplate(template, pose, info) {
  return template
    .replaceAll('{pose}', pose.label)
    .replaceAll('{ml}', String(info.ml ?? 0))
    .replaceAll('{climax}', String(info.climaxes ?? 1))
    .replaceAll('{minutes}', String(info.minutes ?? 10));
}

export function pushEvent(state, now, info) {
  const pose = pickPose(state);
  const line = pose.lines[Math.floor(Math.random() * pose.lines.length)];
  const event = {
    id: `evt-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: now,
    kind: info.kind || 'climax',
    poseKey: pose.key,
    poseLabel: info.poseLabel || pose.label,
    ml: Number.isFinite(info.ml) ? info.ml : 0,
    climaxes: Number.isFinite(info.climaxes) ? info.climaxes : 1,
    text: info.text || fillTemplate(line, pose, info),
  };
  state.events.unshift(event);
  if (state.events.length > 80) state.events.length = 80;
  return event;
}

/** 手动触发一次事件(预览 / 调侃用)。 */
export function previewEvent(state, now = Date.now(), options = {}) {
  tick(state, now);
  const capacity = Math.max(1, state.settings.capacityMl);
  const ml = Number.isFinite(options.ml) ? options.ml : Math.round((Math.random() * 7 + 2) * 10) / 10;
  const climaxes = Number.isFinite(options.climaxes) ? options.climaxes : 1;
  const injected = Math.max(0, Math.min(capacity, ml));
  state.pool = Math.min(capacity, state.pool + injected);
  state.lifetimeMl += injected;
  if (injected > 0) state.lastReleaseAt = now;
  state.climaxCount += climaxes;
  state.lastClimaxAt = now;
  state.decayClockAt = now;
  state.arousal = 100;
  if (state.episode.active) {
    state.episode.minutes = 0;
    state.episode.tokens = 0;
    state.episode.baseArousal = 100;
    state.episode.clockAt = now;
    state.episode.lastActivityAt = now;
  }
  return pushEvent(state, now, { kind: 'preview', ml: round1(injected), climaxes });
}

/* ========================================================================
 * 派生视图
 * ===================================================================== */

export function uterusStateOf(percent) {
  if (percent <= 0.5) return { key: 'clean', label: '干净', tone: 'clean' };
  if (percent <= 25) return { key: 'trace', label: '少量内射', tone: 'trace' };
  if (percent <= 50) return { key: 'half', label: '半满', tone: 'half' };
  if (percent <= 85) return { key: 'full', label: '射满精液', tone: 'full' };
  return { key: 'burst', label: '被射爆', tone: 'burst' };
}

export function arousalStageOf(arousal) {
  const value = Math.max(0, Math.min(100, arousal));
  const stage = AROUSAL_STAGES.find((item) => value < item.max) || AROUSAL_STAGES[AROUSAL_STAGES.length - 1];
  return { key: stage.key, label: stage.label, index: AROUSAL_STAGES.indexOf(stage) + 1, total: AROUSAL_STAGES.length };
}

export function repressionStageOf(repression) {
  const value = Math.max(0, repression);
  const stage = REPRESSION_STAGES.find((item) => value < item.max) || REPRESSION_STAGES[REPRESSION_STAGES.length - 1];
  return { key: stage.key, label: stage.label };
}

/** 按情欲与性压抑推导语音模型的情感参数。 */
export function voiceOf(arousal, repression) {
  const a = clampNum(arousal / 100, 0, 1);
  const r = clampNum(repression / 100, 0, 1.2);
  let base;
  if (a >= 0.9) base = VOICE_EMOTIONS.climaxEdge;
  else if (a >= 0.7) base = VOICE_EMOTIONS.eager;
  else if (r >= 0.7) base = VOICE_EMOTIONS.needy;
  else if (a >= 0.4) base = VOICE_EMOTIONS.tender;
  else if (r >= 0.4) base = VOICE_EMOTIONS.overwhelmed;
  else base = VOICE_EMOTIONS.calm;

  return {
    emotion: base.key,
    emotionLabel: base.label,
    style: base.style,
    params: {
      pitch: round2(clampNum(base.pitch + (a - 0.5) * 0.12 - (r - 0.5) * 0.05, 0.8, 1.28)),
      speed: round2(clampNum(base.speed + (a - 0.5) * 0.1, 0.8, 1.32)),
      volume: round2(clampNum(base.volume + (a - 0.5) * 0.08, 0.7, 1.16)),
      intensity: round2(clampNum(a * 0.7 + r * 0.3, 0, 1)),
      arousal: round2(a),
      repression: round2(r),
    },
  };
}

export function viewOf(state, now = Date.now()) {
  tick(state, now);
  const st = state.settings;
  const capacity = Math.max(1, st.capacityMl);
  const percent = clampNum((state.pool / capacity) * 100, 0, 100);
  const arousal = clampNum(state.arousal, 0, 100);
  const ep = state.episode;

  return {
    ok: true,
    now,
    createdAt: state.createdAt,
    settings: { ...st },
    pool: round1(state.pool),
    capacity,
    poolPercent: round1(percent),
    uterus: uterusStateOf(percent),
    arousal: round1(arousal),
    arousalStage: arousalStageOf(arousal),
    repression: round1(state.repression),
    repressionStage: repressionStageOf(state.repression),
    climaxCount: state.climaxCount,
    sinceClimaxMs: state.lastClimaxAt > 0 ? now - state.lastClimaxAt : null,
    sinceReleaseMs: state.lastReleaseAt > 0 ? now - state.lastReleaseAt : null,
    sinceTokensMs: state.lastTokenAt > 0 ? now - state.lastTokenAt : null,
    lifetimeTokens: state.lifetimeTokens,
    lifetimeMl: round1(state.lifetimeMl),
    episode: {
      active: !!ep.active,
      minutes: round1(ep.minutes),
      tokens: ep.tokens,
      mlPending: round1(st.tokensPerMl > 0 ? ep.tokens / st.tokensPerMl : 0),
      progressMinutes: clampNum(ep.minutes / Math.max(0.01, st.climaxMinMinutes), 0, 1),
      progressTokens: clampNum(ep.tokens / Math.max(1, st.climaxTokenThreshold), 0, 1),
      progressArousal: clampNum(arousal / Math.max(1, st.climaxArousalThreshold), 0, 1),
    },
    voice: voiceOf(arousal, state.repression),
    events: state.events.slice(0, 40),
  };
}

/** 合并设置;返回被拒字段说明。 */
export function applySettings(state, patch) {
  if (!patch || typeof patch !== 'object') return { rejected: [] };
  const rejected = [];
  const numeric = {
    tokensPerMl: [1000, 1e9],
    capacityMl: [1, 100000],
    absorbPerHour: [0, 1000],
    arousalPerMinute: [0, 1000],
    arousalPerMl: [0, 1000],
    climaxMinMinutes: [0.5, 100000],
    climaxTokenThreshold: [1000, 1e12],
    climaxArousalThreshold: [1, 100],
    climaxPauseMinutes: [0, 100000],
    climaxDecayPercentPerMinute: [0, 95],
    climaxRepressionRelief: [0, 100000],
    repressionPerHour: [0, 1000],
    episodeIdleMinutes: [1, 100000],
    repressionCarryMinutes: [1, 100000],
  };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    if (key === 'ttsEndpoint' || key === 'ttsVoice') {
      state.settings[key] = String(value ?? '');
      continue;
    }
    if (key === 'ttsEnabled' || key === 'absorbEnabled') {
      state.settings[key] = Boolean(value);
      continue;
    }
    const range = numeric[key];
    const parsed = Number(value);
    if (!range || !Number.isFinite(parsed)) {
      rejected.push(key);
      continue;
    }
    state.settings[key] = clampNum(parsed, range[0], range[1]);
  }
  return { rejected };
}

export { MINUTE, HOUR };
