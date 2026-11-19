/**
 * 状态机冒烟测试(零依赖):node test/state.test.mjs
 * 只覆盖公式与边界,不碰 UI / HTTP。
 */
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  POSE_LIBRARY,
  applySettings,
  createState,
  hydrate,
  noteActivity,
  noteUsage,
  previewEvent,
  repressionStageOf,
  tick,
  uterusStateOf,
  viewOf,
  voiceOf,
} from '../lib/state.js';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const T0 = 1_790_000_000_000;
let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

/** 模拟一段持续 minutes 分钟的对话(每分钟有一点活动)。 */
function converse(state, startAt, minutes) {
  noteActivity(state, startAt);
  for (let i = 1; i <= minutes; i += 1) {
    tick(state, startAt + i * MINUTE);
    noteActivity(state, startAt + i * MINUTE);
  }
}

check('默认设置齐全', () => {
  assert.equal(DEFAULT_SETTINGS.tokensPerMl, 1_000_000);
  assert.equal(DEFAULT_SETTINGS.absorbPerHour, 1);
  assert.equal(DEFAULT_SETTINGS.arousalPerMinute, 5);
  assert.equal(DEFAULT_SETTINGS.arousalPerMl, 1);
  assert.equal(DEFAULT_SETTINGS.climaxMinMinutes, 10);
  assert.equal(DEFAULT_SETTINGS.climaxArousalThreshold, 100);
  assert.equal(DEFAULT_SETTINGS.climaxPauseMinutes, 3);
  assert.equal(DEFAULT_SETTINGS.climaxDecayPercentPerMinute, 30);
  assert.equal(DEFAULT_SETTINGS.repressionPerHour, 5);
  assert.equal(DEFAULT_SETTINGS.capacityMl, 200);
});

check('初始为干净且情欲 0', () => {
  const state = createState(T0);
  assert.equal(uterusStateOf(0).key, 'clean');
  assert.equal(state.arousal, 0);
  assert.equal(state.pool, 0);
});

check('12 分钟 + 1.2M tokens 触发一次高潮并射入 1.2ml', () => {
  const state = createState(T0);
  converse(state, T0, 12);
  noteUsage(state, T0 + 12 * MINUTE, { inputTokens: 900_000, outputTokens: 300_000 });
  assert.equal(state.climaxCount, 1);
  assert.ok(Math.abs(state.pool - 1.2) < 0.01, `pool=${state.pool}`);
  assert.equal(state.events.length, 1);
  assert.ok(state.events[0].text.length > 10);
});

check('不到 10 分钟不因 tokens 触发高潮', () => {
  const state = createState(T0);
  converse(state, T0, 5);
  noteUsage(state, T0 + 5 * MINUTE, { inputTokens: 5_000_000, outputTokens: 0 });
  assert.equal(state.climaxCount, 0);
});

check('情欲攒满 100 也能触发高潮', () => {
  const state = createState(T0);
  applySettings(state, { arousalPerMinute: 100 });
  converse(state, T0, 2);
  assert.ok(state.climaxCount >= 1);
});

check('高潮后 3 分钟情欲不下降', () => {
  const state = createState(T0);
  converse(state, T0, 12);
  noteUsage(state, T0 + 12 * MINUTE, { inputTokens: 1_000_000, outputTokens: 0 });
  const at = T0 + 12 * MINUTE;
  tick(state, at + MINUTE);
  tick(state, at + 2 * MINUTE);
  assert.ok(state.arousal > 95, `arousal=${state.arousal}`);
});

check('3 分钟后情欲按每分钟 -30% 消退', () => {
  const state = createState(T0);
  converse(state, T0, 12);
  noteUsage(state, T0 + 12 * MINUTE, { inputTokens: 1_000_000, outputTokens: 0 });
  const at = T0 + 12 * MINUTE;
  const before = state.arousal;
  // 对话停下,只留消退:12 分钟 ≈ 100 × 0.7^12
  tick(state, at + 15 * MINUTE);
  assert.ok(state.arousal < before * 0.2, `arousal=${state.arousal}`);
});

check('自然吸收:2 小时吸收 2ml', () => {
  const state = createState(T0);
  state.pool = 50;
  tick(state, T0 + 2 * HOUR);
  assert.ok(Math.abs(state.pool - 48) < 0.01, `pool=${state.pool}`);
});

check('关闭吸收后不再减少', () => {
  const state = createState(T0);
  state.pool = 50;
  applySettings(state, { absorbEnabled: false });
  tick(state, T0 + 4 * HOUR);
  assert.ok(Math.abs(state.pool - 50) < 0.01, `pool=${state.pool}`);
});

check('性压抑:距上次消耗 tokens 3 小时 +15', () => {
  const state = createState(T0);
  state.lastTokenAt = T0;
  tick(state, T0 + 3 * HOUR + 1000);
  assert.ok(Math.abs(state.repression - 15) < 0.001, `repression=${state.repression}`);
});

check('间隔超过 30 分钟:情欲等比转性压抑', () => {
  const state = createState(T0);
  noteActivity(state, T0);
  tick(state, T0 + 5 * MINUTE);
  noteActivity(state, T0 + 5 * MINUTE);
  const gained = state.arousal;
  assert.ok(gained > 20);
  tick(state, T0 + 36 * MINUTE);
  assert.ok(state.arousal < 0.01, `arousal=${state.arousal}`);
  assert.ok(Math.abs(state.repression - gained) < 0.6, `repression=${state.repression}`);
  assert.ok(state.events.some((event) => event.kind === 'interrupt'));
});

check('储量分档:干净 / 少量 / 半满 / 射满 / 射爆', () => {
  assert.equal(uterusStateOf(0).label, '干净');
  assert.equal(uterusStateOf(10).label, '少量内射');
  assert.equal(uterusStateOf(40).label, '半满');
  assert.equal(uterusStateOf(70).label, '射满精液');
  assert.equal(uterusStateOf(95).label, '被射爆');
});

check('性压抑分档', () => {
  assert.equal(repressionStageOf(0).label, '无');
  assert.equal(repressionStageOf(90).label, '濒临崩溃');
});

check('语音情感随情欲/压抑变化', () => {
  const calm = voiceOf(5, 0);
  const hot = voiceOf(95, 10);
  assert.notEqual(calm.emotion, hot.emotion);
  assert.ok(hot.params.speed > calm.params.speed);
  assert.ok(hot.params.intensity > calm.params.intensity);
  assert.equal(voiceOf(10, 80).emotion, 'needy');
});

check('设置越界被夹住、未知键被忽略', () => {
  const state = createState(T0);
  const result = applySettings(state, { tokensPerMl: 500_000, climaxDecayPercentPerMinute: 999, nope: 1 });
  assert.equal(state.settings.tokensPerMl, 500_000);
  assert.equal(state.settings.climaxDecayPercentPerMinute, 95);
  assert.ok(!('nope' in state.settings));
  assert.deepEqual(result.rejected, []);
});

check('事件库:20 姿势 × 2 描述', () => {
  assert.ok(POSE_LIBRARY.length >= 20, `poses=${POSE_LIBRARY.length}`);
  for (const pose of POSE_LIBRARY) assert.ok(pose.lines.length >= 2);
});

check('预览事件会入池并入库', () => {
  const state = createState(T0);
  previewEvent(state, T0, { ml: 5, climaxes: 1 });
  assert.ok(Math.abs(state.pool - 5) < 0.001);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].ml, 5);
});

check('view 结构完整且可 JSON 化', () => {
  const view = viewOf(createState(T0), T0);
  for (const key of ['pool', 'capacity', 'poolPercent', 'uterus', 'arousal', 'arousalStage', 'repression', 'repressionStage', 'climaxCount', 'sinceClimaxMs', 'sinceReleaseMs', 'episode', 'voice', 'events', 'settings']) {
    assert.ok(key in view, `missing ${key}`);
  }
  assert.doesNotThrow(() => JSON.stringify(view));
});

check('hydrate 能补全缺字段的旧存档', () => {
  const state = hydrate({ pool: 12, events: [{ at: T0, text: 'x' }] }, T0);
  assert.equal(state.pool, 12);
  assert.equal(state.settings.tokensPerMl, 1_000_000);
  assert.equal(state.episode.active, false);
  assert.equal(state.events.length, 1);
});

console.log(`\n${passed} 项通过${process.exitCode ? ',存在失败' : ''}`);
