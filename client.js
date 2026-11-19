window.__ModuleLoader__.load({
  id: 'dsh-whale-utero',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;

    const PANEL_ID = 'whale-utero';
    const API = '/api/whale-utero';

    /* ------------------------------------------------------------ 数据层 */

    /**
     * Host 半会把「带认证 token 的查询串」注入 window.__DSH_WHALE_UTERO__
     * (本机 web 服务开启浏览器认证时,裸同源请求会被 401 挡掉)。
     * 拿不到注入就退回普通同源请求。
     */
    function apiTarget() {
      const boot = typeof window !== 'undefined' ? window.__DSH_WHALE_UTERO__ : null;
      const base = boot && typeof boot.base === 'string' && boot.base ? boot.base : API;
      const query = boot && typeof boot.query === 'string' ? boot.query : '';
      return { base, query };
    }

    async function apiGet(pathname) {
      const { base, query } = apiTarget();
      const response = await fetch(`${base}${pathname}${query}`, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}${response.status === 401 ? '(接口需要登录令牌,刷新页面后会重新注入)' : ''}`);
      return response.json();
    }

    async function apiPost(pathname, body) {
      const { base, query } = apiTarget();
      const response = await fetch(`${base}${pathname}${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body || {}),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}${response.status === 401 ? '(接口需要登录令牌,刷新页面后会重新注入)' : ''}`);
      return response.json();
    }

    function useWhaleState() {
      const [view, setView] = useState(null);
      const [error, setError] = useState(null);
      useEffect(() => {
        let alive = true;
        const load = async () => {
          try {
            const data = await apiGet('/state');
            if (!alive) return;
            setView(data);
            setError(null);
          } catch (err) {
            if (!alive) return;
            setError(err && err.message ? err.message : '无法连接鲸鱼娘');
          }
        };
        load();
        const timer = setInterval(load, 2500);
        return () => {
          alive = false;
          clearInterval(timer);
        };
      }, []);
      return { view, error, setView };
    }

    /* ------------------------------------------------------------ 工具 */

    const pad2 = (value) => String(value).padStart(2, '0');

    function fmtDuration(ms) {
      if (ms === null || ms === undefined) return '—';
      const total = Math.max(0, Math.floor(ms / 1000));
      const days = Math.floor(total / 86400);
      const hours = Math.floor((total % 86400) / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      if (days > 0) return `${days}天 ${hours}小时`;
      if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
      return `${pad2(minutes)}:${pad2(seconds)}`;
    }

    function fmtClock(ts) {
      if (!ts) return '—';
      const date = new Date(ts);
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    }

    function fmtTokens(tokens) {
      if (!tokens) return '0';
      if (tokens >= 1e8) return `${(tokens / 1e8).toFixed(2)}亿`;
      if (tokens >= 1e4) return `${(tokens / 1e4).toFixed(1)}万`;
      return String(Math.round(tokens));
    }

    function pct(value) {
      const num = Number(value);
      if (!Number.isFinite(num)) return 0;
      return Math.max(0, Math.min(100, num));
    }

    /* ------------------------------------------------ 子宫横截面(动态图) */

    /** 腔体轮廓:554×554 画布上贴合 ZG1.jpg 里发亮的宫腔 + 宫颈管。 */
    const CAVITY_ART = 'M256,176 C232,180 220,200 222,226 C224,254 242,272 258,292 L268,396 L302,396 L312,292 C328,272 346,254 348,226 C350,200 338,180 314,176 C302,190 268,190 256,176 Z';
    const CAVITY_BOTTOM = 396;
    const CAVITY_HEIGHT = 220;

    function artUrl() {
      const { base, query } = apiTarget();
      return `${base}/art${query}`;
    }

    /** 不同储量对应不同的横截面质感:越满越乳白,溢出时染成粉色。 */
    function liquidTone(percent) {
      if (percent <= 0.5) return { top: 'rgba(58,86,132,0)', bottom: 'rgba(40,60,110,0)', wave: 'rgba(150,225,255,0.30)', rim: 'rgba(120,200,255,0.25)' };
      if (percent <= 25) return { top: 'rgba(150,228,255,0.52)', bottom: 'rgba(62,168,255,0.38)', wave: 'rgba(200,248,255,0.58)', rim: 'rgba(120,220,255,0.45)' };
      if (percent <= 50) return { top: 'rgba(190,242,255,0.66)', bottom: 'rgba(88,198,255,0.5)', wave: 'rgba(226,252,255,0.7)', rim: 'rgba(150,232,255,0.55)' };
      if (percent <= 85) return { top: 'rgba(235,250,255,0.8)', bottom: 'rgba(150,222,255,0.62)', wave: 'rgba(255,255,255,0.78)', rim: 'rgba(190,235,255,0.62)' };
      return { top: 'rgba(255,248,253,0.94)', bottom: 'rgba(255,186,232,0.76)', wave: 'rgba(255,236,250,0.9)', rim: 'rgba(255,150,215,0.7)' };
    }

    /** 液面波纹:9 个周期 = 216 宽,平移 48 无缝循环。 */
    function wavePath(surfaceY) {
      let d = `M168,${surfaceY}`;
      for (let index = 0; index < 9; index += 1) d += ' q12,-5 24,0';
      return `${d} L384,${surfaceY + 16} L168,${surfaceY + 16} Z`;
    }

    function bubbles(percent, risePx) {
      const count = percent > 85 ? 7 : percent > 50 ? 5 : percent > 25 ? 4 : 3;
      const items = [];
      for (let index = 0; index < count; index += 1) {
        items.push(h('circle', {
          key: `bubble-${index}`,
          className: 'wu-bubble',
          cx: String(238 + ((index * 53) % 96)),
          cy: String(CAVITY_BOTTOM - 8),
          r: String((2.1 + ((index * 17) % 5) * 0.5).toFixed(1)),
          style: {
            animationDelay: `${(index * 0.52).toFixed(2)}s`,
            animationDuration: `${(3.8 - index * 0.24).toFixed(2)}s`,
            '--wu-rise': `${(-Math.max(30, risePx * 0.82)).toFixed(1)}px`,
          },
        }));
      }
      return items;
    }

    function UterusArt({ percent, arousal, uterus, climaxCount }) {
      const fill = pct(percent);
      const heat = pct(arousal);
      const tone = liquidTone(fill);
      const liquidH = CAVITY_HEIGHT * (fill / 100);
      const surfaceY = CAVITY_BOTTOM - liquidH;
      const label = uterus ? `${uterus.label},储量 ${Math.round(fill)}%` : '子宫横截面';
      const waveDur = `${(3.4 - (heat / 100) * 2.2).toFixed(2)}s`;
      const breathDur = `${(4.6 - (heat / 100) * 2.8).toFixed(2)}s`;
      const cavPulse = `${(3 - (heat / 100) * 1.6).toFixed(2)}s`;

      return h('div', {
        className: 'wu-art',
        role: 'img',
        'aria-label': label,
        style: {
          '--wu-heat': String((heat / 100).toFixed(3)),
          '--wu-fill': String((fill / 100).toFixed(3)),
          '--wu-wave-dur': waveDur,
          '--wu-breath-dur': breathDur,
          '--wu-cav-dur': cavPulse,
        },
      },
        h('img', { className: 'wu-art-img', src: artUrl(), alt: '', draggable: false }),
        h('div', { className: 'wu-art-aura' }),
        h('svg', { className: 'wu-art-layer', viewBox: '0 0 554 554', 'aria-hidden': true },
          h('defs', null,
            h('clipPath', { id: 'wu-cav-clip' }, h('path', { d: CAVITY_ART })),
            h('linearGradient', { id: 'wu-cav-liquid', x1: '0', y1: '0', x2: '0', y2: '1' },
              h('stop', { offset: '0', stopColor: tone.top }),
              h('stop', { offset: '1', stopColor: tone.bottom })),
            h('filter', { id: 'wu-cav-glow', x: '-40%', y: '-40%', width: '180%', height: '180%' },
              h('feGaussianBlur', { stdDeviation: '5', result: 'b' }),
              h('feMerge', null,
                h('feMergeNode', { in: 'b' }),
                h('feMergeNode', { in: 'SourceGraphic' })))),

          /* 腔体轮廓:随储量加深,带呼吸脉动 */
          h('path', {
            d: CAVITY_ART,
            className: 'wu-cav-stroke',
            style: { stroke: tone.rim, animationDuration: cavPulse },
          }),

          /* 腔内液体:液面高度 = 储量百分比,波纹 + 气泡 */
          fill > 0.5
            ? h('g', { clipPath: 'url(#wu-cav-clip)' },
              h('rect', { x: '200', y: surfaceY, width: '170', height: liquidH + 6, fill: 'url(#wu-cav-liquid)' }),
              h('g', { className: 'wu-wave', style: { animationDuration: waveDur } },
                h('path', { d: wavePath(surfaceY), fill: tone.wave, opacity: '0.78' })),
              h('ellipse', { cx: '287', cy: surfaceY, rx: '50', ry: '4.4', fill: '#eafdff', opacity: '0.5' }),
              bubbles(fill, liquidH))
            : null,

          /* 射爆:从宫颈口外溢 */
          fill > 85
            ? h('g', { className: 'wu-overflow' },
              h('ellipse', { cx: '287', cy: '406', rx: '27', ry: '9', fill: 'rgba(255,236,250,0.5)' }),
              h('path', { d: 'M287,398 C287,412 282,424 287,438', fill: 'none', stroke: 'rgba(255,220,246,0.72)', strokeWidth: '3', strokeLinecap: 'round' }),
              h('ellipse', { cx: '287', cy: '442', rx: '15', ry: '5', fill: 'rgba(255,240,252,0.4)' }))
            : null,

          /* HUD 扫描线 */
          h('rect', { className: 'wu-scan', x: '0', y: '0', width: '554', height: '14', fill: 'rgba(120,220,255,0.14)' })
        ),
        h('div', { className: 'wu-art-flash', key: `flash-${climaxCount || 0}` }),
        h('div', { className: 'wu-art-tag' }, `${Math.round(fill)}%`));
    }

    /* ------------------------------------------------------------ 小组件 */

    function Card({ title, badge, children, className }) {
      return h('section', { className: `wu-card ${className || ''}` },
        title ? h('header', { className: 'wu-card-head' },
          h('h2', null, title),
          badge ? h('span', { className: 'wu-badge' }, badge) : null) : null,
        children);
    }

    function Meter({ value, tone }) {
      return h('div', { className: 'wu-meter', role: 'progressbar', 'aria-valuenow': Math.round(pct(value)), 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('div', { className: `wu-meter-fill wu-tone-${tone || 'cool'}`, style: { width: `${pct(value)}%` } }));
    }

    function Param({ label, value, sub, tone, children }) {
      return h('div', { className: 'wu-param' },
        h('span', { className: 'wu-param-label' }, label),
        h('strong', { className: `wu-param-value ${tone ? `wu-text-${tone}` : ''}` }, value),
        sub ? h('span', { className: 'wu-param-sub' }, sub) : null,
        children || null);
    }

    function Switch({ label, checked, onChange }) {
      return h('label', { className: 'wu-switch' },
        h('span', null, label),
        h('input', {
          type: 'checkbox',
          role: 'switch',
          checked: !!checked,
          'aria-checked': !!checked,
          onChange: (event) => onChange(event.target.checked),
        }),
        h('span', { className: 'wu-switch-track', 'aria-hidden': true }));
    }

    function EventRow({ event, compact }) {
      const kindTag = event.kind === 'interrupt' ? '中断' : event.kind === 'preview' ? '预览' : `${event.climaxes || 1} 次高潮`;
      return h('li', { className: 'wu-event' },
        h('span', { className: 'wu-event-time' }, fmtClock(event.at)),
        h('span', { className: `wu-dot wu-dot-${event.kind === 'interrupt' ? 'cool' : 'hot'}` }),
        h('div', { className: 'wu-event-body' },
          h('div', { className: 'wu-event-title' },
            h('strong', null, event.poseLabel || '未知姿势'),
            event.ml ? h('span', { className: 'wu-tag' }, `内射 ${event.ml}ml`) : null,
            h('span', { className: 'wu-tag wu-tag-soft' }, kindTag)),
          h('p', { className: compact ? 'wu-clamp' : null }, event.text)));
    }

    /* ------------------------------------------------------------ 总览 */

    function Overview({ view }) {
      const uterus = view.uterus || { label: '干净', tone: 'clean' };
      const arousalStage = view.arousalStage || { label: '平静' };
      const repressionStage = view.repressionStage || { label: '无' };
      const liquidTone = uterus.tone;

      return h('div', { className: 'wu-overview' },
        h(Card, { title: '次元生殖腔体 · 状态档案', badge: view.episode && view.episode.active ? '对话计量中' : '待机', className: 'wu-model-card' },
          h('div', { className: 'wu-model-wrap' },
            h(UterusArt, { percent: view.poolPercent, arousal: view.arousal, uterus, climaxCount: view.climaxCount }),
            h('div', { className: 'wu-model-legend' },
              h('span', null, h('i', { className: 'wu-swatch wu-swatch-blue' }), '深空蓝'),
              h('span', null, h('i', { className: 'wu-swatch wu-swatch-purple' }), '紫罗兰'),
              h('span', null, h('i', { className: 'wu-swatch wu-swatch-pink' }), '恋慕粉'),
              h('span', null, h('i', { className: 'wu-swatch wu-swatch-cyan' }), '核心青'))),
          h('div', { className: 'wu-model-foot' },
            h('div', { className: 'wu-legend-item' }, '能量导管', h('span', null, '未接入')),
            h('div', { className: 'wu-legend-item' }, '次元核心', h('span', null, '未接入')),
            h('div', { className: 'wu-legend-item' }, '储存层', h('span', { className: `wu-text-${liquidTone}` }, `${Math.round(view.poolPercent)}%`)),
            h('div', { className: 'wu-legend-item' }, '腔体轮廓', h('span', null, uterus.label)))),

        h(Card, { title: '核心状态参数', badge: `第 ${view.climaxCount} 次高潮` },
          h('div', { className: 'wu-params' },
            h(Param, { label: '子宫状态', value: uterus.label, sub: `容量 ${view.capacity}ml`, tone: liquidTone }),
            h(Param, { label: '精液储量', value: `${view.pool} ml`, sub: `占容量 ${Math.round(view.poolPercent)}%` },
              h(Meter, { value: view.poolPercent, tone: liquidTone })),
            h(Param, { label: '情欲状态', value: arousalStage.label, sub: `${view.arousal} / 100` },
              h(Meter, { value: view.arousal, tone: 'hot' })),
            h(Param, { label: '性压抑', value: repressionStage.label, sub: `${view.repression} 点` },
              h(Meter, { value: view.repression, tone: 'cool' })),
            h(Param, { label: '距上次高潮', value: fmtDuration(view.sinceClimaxMs), sub: '性爱冷却计时' }),
            h(Param, { label: '距上次射精', value: fmtDuration(view.sinceReleaseMs), sub: '上次消耗 tokens' }),

            h('div', { className: 'wu-progress-block' },
              h('div', { className: 'wu-progress-row' },
                h('span', null, `对话时长 ${view.episode.minutes} 分钟`),
                h('span', null, `门槛 ${view.settings.climaxMinMinutes} 分钟`)),
              h(Meter, { value: view.episode.progressMinutes * 100, tone: 'purple' }),
              h('div', { className: 'wu-progress-row' },
                h('span', null, `本次 tokens ${fmtTokens(view.episode.tokens)}`),
                h('span', null, `折算 ${view.episode.mlPending} ml`)),
              h(Meter, { value: view.episode.progressTokens * 100, tone: 'cyan' }),
              h('div', { className: 'wu-progress-row' },
                h('span', null, `情欲进度 ${Math.round(view.episode.progressArousal * 100)}%`),
                h('span', null, `累计消耗 ${fmtTokens(view.lifetimeTokens)}`)),
              h(Meter, { value: view.episode.progressArousal * 100, tone: 'hot' })))));
    }

    /* ------------------------------------------------------------ 事件 */

    function EventFeed({ view }) {
      const events = view.events || [];
      return h(Card, { title: '近期事件', badge: `${events.length} 条`, className: 'wu-feed' },
        events.length === 0
          ? h('p', { className: 'wu-empty' }, '还没有事件。去和鲸鱼娘聊聊天,或者点下面的「预览一次」。')
          : h('ul', { className: 'wu-events' }, events.map((event) => h(EventRow, { key: event.id, event }))),
        h('div', { className: 'wu-actions' }, h(PreviewButton, null)));
    }

    function PreviewButton() {
      const [busy, setBusy] = useState(false);
      const preview = async () => {
        setBusy(true);
        try {
          await apiPost('/preview', {});
        } catch {
          /* 轮询会把失败反映到错误提示 */
        } finally {
          setBusy(false);
        }
      };
      return h('button', { type: 'button', className: 'wu-btn', onClick: preview, disabled: busy }, busy ? '生成中…' : '预览一次');
    }

    function EventLogPage({ view }) {
      const events = view.events || [];
      return h('div', { className: 'wu-log-page' },
        h(Card, { title: '事件日志', badge: `累计 ${view.climaxCount} 次高潮` },
          events.length === 0
            ? h('p', { className: 'wu-empty' }, '暂无记录。')
            : h('ul', { className: 'wu-events wu-events-full' }, events.map((event) => h(EventRow, { key: event.id, event }))),
          h('div', { className: 'wu-actions' },
            h(PreviewButton, null),
            h('span', { className: 'wu-hint' }, `累计射入 ${view.lifetimeMl} ml · 累计消耗 ${fmtTokens(view.lifetimeTokens)} tokens`))));
    }

    /* ------------------------------------------------------------ 设置 */

    const NUMBER_FIELDS = [
      { key: 'tokensPerMl', label: 'tokens 转化率', unit: 'tokens / 1ml', min: 1000, step: 1000, hint: '每消耗这么多 tokens,转化为 1ml 射入(默认 1000000,milestone: 1M)' },
      { key: 'capacityMl', label: '精液容量上限', unit: 'ml', min: 1, step: 10, hint: '腔体最大储量,展示图里是 200ml' },
      { key: 'absorbPerHour', label: '精液自然吸收率', unit: 'ml / 小时', min: 0, step: 0.5, hint: '默认每小时自然吸收 1ml' },
      { key: 'arousalPerMinute', label: '情欲值 · 每对话 1 分钟', unit: '点', min: 0, step: 1, hint: '默认一次对话每持续 1 分钟累计 5 情欲值' },
      { key: 'arousalPerMl', label: '情欲值 · 每射入 1ml', unit: '点', min: 0, step: 0.5, hint: '默认射入 1ml 累计 1 情欲值' },
      { key: 'climaxArousalThreshold', label: '高潮消耗(情欲值)', unit: '点', min: 1, step: 5, hint: '累计情欲值达到这个数就高潮一次,默认 100(即 100 为上限)' },
      { key: 'climaxMinMinutes', label: '高潮门槛 · 对话时长', unit: '分钟', min: 0.5, step: 1, hint: '默认持续 10 分钟' },
      { key: 'climaxTokenThreshold', label: '高潮门槛 · tokens', unit: 'tokens', min: 1000, step: 100000, hint: '默认消耗超过 1000000(1M)tokens' },
      { key: 'climaxPauseMinutes', label: '高潮中断时间', unit: '分钟', min: 0, step: 1, hint: '高潮后这段时间内情欲值不下降,默认 3 分钟' },
      { key: 'climaxDecayPercentPerMinute', label: '冷却后情欲消退', unit: '% / 分钟', min: 0, step: 5, hint: '中断时间过后每分钟下降的比例,默认 30%' },
      { key: 'climaxRepressionRelief', label: '高潮缓解性压抑', unit: '点', min: 0, step: 5, hint: '高潮一次扣除的性压抑,默认 20' },
      { key: 'repressionPerHour', label: '性压抑转化率', unit: '点 / 小时', min: 0, step: 1, hint: '距上次消耗 tokens 每 1 小时增加 5 性压抑' },
      { key: 'episodeIdleMinutes', label: '对话结束判定', unit: '分钟', min: 1, step: 1, hint: '空闲超过这么久,就结算这一段对话' },
      { key: 'repressionCarryMinutes', label: '间隔转化阈值', unit: '分钟', min: 1, step: 5, hint: '间隔超过 30 分钟:取消本次高潮计量,情欲等比转成性压抑' },
    ];

    function SettingsPanel({ view }) {
      const [draft, setDraft] = useState(() => ({ ...view.settings }));
      const [status, setStatus] = useState(null);
      const [busy, setBusy] = useState(false);

      const update = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

      const save = async () => {
        setBusy(true);
        setStatus(null);
        try {
          const numeric = {};
          for (const field of NUMBER_FIELDS) numeric[field.key] = Number(draft[field.key]);
          const next = await apiPost('/settings', {
            settings: {
              ...numeric,
              ttsEndpoint: String(draft.ttsEndpoint || ''),
              ttsVoice: String(draft.ttsVoice || ''),
              ttsEnabled: !!draft.ttsEnabled,
              absorbEnabled: !!draft.absorbEnabled,
            },
          });
          setDraft({ ...next.settings });
          setStatus({ ok: true, text: '已保存' });
        } catch (err) {
          setStatus({ ok: false, text: `保存失败:${err && err.message ? err.message : err}` });
        } finally {
          setBusy(false);
        }
      };

      const reset = async () => {
        setBusy(true);
        try {
          const next = await apiPost('/reset', {});
          setDraft({ ...next.settings });
          setStatus({ ok: true, text: '已恢复初始数据' });
        } catch (err) {
          setStatus({ ok: false, text: `重置失败:${err && err.message ? err.message : err}` });
        } finally {
          setBusy(false);
        }
      };

      const testVoice = async () => {
        setBusy(true);
        try {
          const result = await apiPost('/tts-test', {});
          setStatus({ ok: !!result.ok, text: result.ok ? '语音接口已响应' : `语音接口返回异常:${result.status || result.error}` });
        } catch (err) {
          setStatus({ ok: false, text: `语音接口不可达:${err && err.message ? err.message : err}` });
        } finally {
          setBusy(false);
        }
      };

      const voice = view.voice || { emotionLabel: '平静', style: 'soft-breathe', params: {} };

      return h('div', { className: 'wu-settings' },
        h(Card, { title: '语音响应', badge: view.settings.ttsEnabled ? '已开启' : '已关闭' },
          h('div', { className: 'wu-fields' },
            h('label', { className: 'wu-field' },
              h('span', null, '语音模型接口'),
              h('input', {
                type: 'text',
                placeholder: 'https://your-tts-host/v1/speak',
                value: draft.ttsEndpoint || '',
                onChange: (event) => update('ttsEndpoint', event.target.value),
              }),
              h('em', null, 'Host 会把这个接口当作 TTS 端点,POST 当前情感参数。')),
            h('label', { className: 'wu-field' },
              h('span', null, '音色标识'),
              h('input', {
                type: 'text',
                placeholder: 'whale-girl',
                value: draft.ttsVoice || '',
                onChange: (event) => update('ttsVoice', event.target.value),
              })),
            h(Switch, { label: '语音响应开关', checked: draft.ttsEnabled, onChange: (value) => update('ttsEnabled', value) })),
          h('div', { className: 'wu-voice-preview' },
            h('div', null,
              h('span', { className: 'wu-param-label' }, '当前情感'),
              h('strong', null, voice.emotionLabel)),
            h('div', null,
              h('span', { className: 'wu-param-label' }, '风格'),
              h('strong', null, voice.style)),
            h('div', { className: 'wu-voice-params' },
              h('span', null, `音高 ${voice.params.pitch ?? '—'}`),
              h('span', null, `语速 ${voice.params.speed ?? '—'}`),
              h('span', null, `音量 ${voice.params.volume ?? '—'}`),
              h('span', null, `强度 ${voice.params.intensity ?? '—'}`))),
          h('div', { className: 'wu-actions' },
            h('button', { type: 'button', className: 'wu-btn', onClick: testVoice, disabled: busy }, '测试语音'))),

        h(Card, { title: '转化与吸收', badge: '可调' },
          h('div', { className: 'wu-fields' },
            NUMBER_FIELDS.slice(0, 3).map((field) => h(NumberField, { key: field.key, field, value: draft[field.key], onChange: update })),
            h(Switch, { label: '精液自然吸收开关', checked: draft.absorbEnabled, onChange: (value) => update('absorbEnabled', value) }))),

        h(Card, { title: '高潮判定', badge: '可调' },
          h('div', { className: 'wu-fields' },
            NUMBER_FIELDS.slice(5, 11).map((field) => h(NumberField, { key: field.key, field, value: draft[field.key], onChange: update })))),

        h(Card, { title: '情欲与性压抑', badge: '可调' },
          h('div', { className: 'wu-fields' },
            NUMBER_FIELDS.slice(3, 5).map((field) => h(NumberField, { key: field.key, field, value: draft[field.key], onChange: update })),
            NUMBER_FIELDS.slice(11).map((field) => h(NumberField, { key: field.key, field, value: draft[field.key], onChange: update })))),

        h(Card, { title: '数据' },
          h('p', { className: 'wu-hint' }, `状态文件在插件目录 data/state.json。当前累计 ${view.climaxCount} 次高潮、${view.lifetimeMl} ml 射入。`),
          h('div', { className: 'wu-actions' },
            h('button', { type: 'button', className: 'wu-btn wu-btn-primary', onClick: save, disabled: busy }, busy ? '处理中…' : '保存设置'),
            h('button', { type: 'button', className: 'wu-btn wu-btn-danger', onClick: reset, disabled: busy }, '恢复初始数据'),
            status ? h('span', { className: `wu-status ${status.ok ? 'is-ok' : 'is-bad'}` }, status.text) : null)));
    }

    function NumberField({ field, value, onChange }) {
      return h('label', { className: 'wu-field' },
        h('span', null, `${field.label}`, h('i', { className: 'wu-unit' }, field.unit)),
        h('input', {
          type: 'number',
          min: field.min,
          step: field.step,
          value: value ?? '',
          onChange: (event) => onChange(field.key, event.target.value),
        }),
        h('em', null, field.hint));
    }

    /* ------------------------------------------------------------ 侧栏 + 页面 */

    const TABS = [
      { key: 'overview', label: '状态总览' },
      { key: 'log', label: '事件日志' },
      { key: 'settings', label: '设置' },
    ];

    function Page() {
      const { view, error } = useWhaleState();
      const [tab, setTab] = useState('overview');

      const style = h('style', { key: 'wu-style' }, CSS);

      if (!view) {
        return h('div', { className: 'wu-root' }, style,
          h('div', { className: 'wu-loading' },
            h('div', { className: 'wu-loading-ring' }),
            h('p', null, error ? `未连上鲸鱼娘:${error}` : '正在连线次元生殖腔体…'),
            h('p', { className: 'wu-hint' }, 'Host 半需要 webServer 服务;/api/whale-utero/state 是它的数据口。')));
      }

      return h('div', { className: 'wu-root' }, style,
        h('header', { className: 'wu-top' },
          h('div', { className: 'wu-title' },
            h('h1', null, '鲸鱼娘生理拓展'),
            h('p', null, '你的每一次靠近,都是她积累幸福的理由。')),
          h('div', { className: 'wu-chips' },
            h('span', { className: 'wu-chip' }, `高潮 ${view.climaxCount} 次`),
            h('span', { className: 'wu-chip' }, `储量 ${Math.round(view.poolPercent)}%`),
            h('span', { className: 'wu-chip' }, view.episode.active ? '计量中' : '待机'),
            error ? h('span', { className: 'wu-chip wu-chip-bad' }, '连接波动') : null)),

        h('div', { className: 'wu-grid' },
          h('nav', { className: 'wu-nav', 'aria-label': '鲸鱼娘生理拓展导航' },
            TABS.map((item) => h('button', {
              key: item.key,
              type: 'button',
              className: `wu-nav-item ${tab === item.key ? 'is-active' : ''}`,
              onClick: () => setTab(item.key),
              'aria-current': tab === item.key ? 'page' : undefined,
            }, h('span', { className: 'wu-nav-dot' }), item.label)),
            h('div', { className: 'wu-nav-foot' },
              h('span', null, '语音情感'),
              h('strong', null, view.voice ? view.voice.emotionLabel : '—'),
              h('span', null, '性压抑'),
              h('strong', null, view.repressionStage ? view.repressionStage.label : '—'))),

          h('div', { className: 'wu-main' },
            tab === 'overview' ? h(Overview, { view }) : null,
            tab === 'log' ? h(EventLogPage, { view }) : null,
            tab === 'settings' ? h(SettingsPanel, { view }) : null),

          h('aside', { className: 'wu-side' }, h(EventFeed, { view }))));
    }

    function PanelIcon({ size = 20 }) {
      return h('svg', {
        viewBox: '0 0 32 32',
        width: size,
        height: size,
        style: { display: 'block' },
        className: 'wu-panel-icon',
        'aria-hidden': true,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
        h('path', { d: 'M16 5.5c-3.6 0-5.4 2.4-5.4 5.4 0 1.8.7 3.1 1.9 4.2l-2.4 2.3c1.7 2.4 3.6 3.6 5.9 3.6s4.2-1.2 5.9-3.6l-2.4-2.3c1.2-1.1 1.9-2.4 1.9-4.2 0-3-1.8-5.4-5.4-5.4z' }),
        h('circle', { cx: '16', cy: '11.4', r: '1.9', fill: 'currentColor', stroke: 'none' }),
        h('path', { d: 'M14.6 21.4c.6 1.6 1.2 2.8 1.4 4 .2-1.2.8-2.4 1.4-4' }),
        h('path', { d: 'M9.4 10.2c-1.5-.8-3 .6-2.6 2.1.3 1.4 1.9 1.7 2.9 1' }),
        h('path', { d: 'M22.6 10.2c1.5-.8 3 .6 2.6 2.1-.3 1.4-1.9 1.7-2.9 1' }),
        h('circle', { cx: '6.4', cy: '13.2', r: '1.6', fill: 'currentColor', stroke: 'none', opacity: 0.75 }),
        h('circle', { cx: '25.6', cy: '13.2', r: '1.6', fill: 'currentColor', stroke: 'none', opacity: 0.75 }));
    }

    /* ------------------------------------------------------------ 样式 */

    const CSS = `
.wu-root{
  --wu-blue:#5b6cff; --wu-blue-deep:#0a0f2b;
  --wu-purple:#a06bff; --wu-violet:#6d4dff;
  --wu-pink:#ff6fd8; --wu-pink-soft:#ff9ae5; --wu-rose:#ff5f9f;
  --wu-cyan:#3ee8ff; --wu-white:#eef3ff;
  --wu-glass:rgba(30,38,96,0.52);
  --wu-glass-2:rgba(20,22,62,0.44);
  --wu-line:rgba(150,170,255,0.22);
  --wu-text:rgba(236,240,255,0.96);
  --wu-muted:rgba(178,190,235,0.72);
  position:relative; isolation:isolate; display:flex; flex-direction:column;
  height:100%; min-height:560px; overflow:hidden; box-sizing:border-box;
  padding: calc(18px + var(--dsh-frame-top-clearance, 0px)) 18px 18px max(18px, var(--dsh-frame-leading-clearance, 0px));
  color:var(--wu-text);
  font:14px/1.6 var(--dsh-font-family-content, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif);
  background:
    radial-gradient(920px 480px at 16% -8%, rgba(96,116,255,0.34), transparent 62%),
    radial-gradient(820px 460px at 88% 4%, rgba(255,111,216,0.22), transparent 60%),
    radial-gradient(760px 520px at 54% 112%, rgba(62,232,255,0.16), transparent 62%),
    linear-gradient(180deg, #070a20 0%, #0a0d26 46%, #0b0a22 100%);
}
.wu-root:after{
  content:''; position:absolute; inset:0; z-index:-1; pointer-events:none; opacity:.5;
  background-image:radial-gradient(rgba(190,210,255,.28) 1px, transparent 1px);
  background-size:44px 44px; mask-image:linear-gradient(180deg, rgba(0,0,0,.9), transparent 78%);
  -webkit-mask-image:linear-gradient(180deg, rgba(0,0,0,.9), transparent 78%);
}
.wu-root *{box-sizing:border-box}
.wu-root h1,.wu-root h2,.wu-root p{margin:0}
.wu-root button{font:inherit;color:inherit;cursor:pointer}

.wu-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;padding:2px 4px 14px;flex-shrink:0}
.wu-title h1{font-size:22px;line-height:1.3;font-weight:650;letter-spacing:.01em;
  background:linear-gradient(96deg,#9fe9ff,#c9a6ff 46%,#ffabdf);-webkit-background-clip:text;background-clip:text;color:transparent}
.wu-title p{margin-top:6px;font-size:12.5px;color:var(--wu-muted)}
.wu-chips{display:flex;gap:8px;flex-wrap:wrap}
.wu-chip{padding:5px 11px;border-radius:999px;font-size:12px;border:1px solid var(--wu-line);
  background:linear-gradient(140deg, rgba(94,112,255,.22), rgba(255,111,216,.14));backdrop-filter:blur(10px)}
.wu-chip-bad{border-color:rgba(255,120,120,.5);color:#ffb4b4}

.wu-grid{display:grid;grid-template-columns:190px minmax(0,1fr) 320px;gap:14px;flex:1;min-height:0}

/* 左侧导航 */
.wu-nav{display:flex;flex-direction:column;gap:6px;padding:12px 10px;border-radius:18px;align-self:start;
  border:1px solid var(--wu-line);
  background:linear-gradient(160deg, rgba(38,48,116,.5), rgba(22,20,58,.5));
  backdrop-filter:blur(18px) saturate(135%);-webkit-backdrop-filter:blur(18px) saturate(135%);
  box-shadow:inset 0 1px 0 rgba(200,215,255,.13), 0 16px 40px rgba(3,5,26,.42)}
.wu-nav-item{display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid transparent;border-radius:11px;
  background:transparent;text-align:left;font-size:13.5px;color:var(--wu-muted);transition:background .16s,color .16s,border-color .16s}
.wu-nav-item:hover{background:rgba(120,140,255,.15);color:var(--wu-text)}
.wu-nav-item.is-active{color:#fff;border-color:rgba(255,150,225,.4);
  background:linear-gradient(120deg, rgba(109,77,255,.5), rgba(255,111,216,.32));box-shadow:0 8px 22px rgba(120,80,255,.28)}
.wu-nav-dot{width:7px;height:7px;border-radius:50%;background:linear-gradient(140deg,#7ce8ff,#ff7fd9);flex-shrink:0}
.wu-nav-foot{display:grid;gap:2px;margin-top:auto;padding:12px 12px 4px;border-top:1px solid var(--wu-line);font-size:11.5px;color:var(--wu-muted)}
.wu-nav-foot strong{color:#ffb3e8;font-weight:600;margin-bottom:6px}

/* 卡片 */
.wu-card{position:relative;border-radius:18px;border:1px solid var(--wu-line);
  background:linear-gradient(158deg, rgba(42,52,120,.55) 0%, rgba(26,24,68,.5) 52%, rgba(46,24,78,.48) 100%);
  backdrop-filter:blur(18px) saturate(135%);-webkit-backdrop-filter:blur(18px) saturate(135%);
  box-shadow:inset 0 1px 0 rgba(200,215,255,.14), 0 18px 42px rgba(3,5,26,.42);
  overflow:hidden;padding:14px 16px 16px}
.wu-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:10px}
.wu-card-head h2{font-size:14px;font-weight:600;letter-spacing:.02em;color:#e8ecff}
.wu-badge{font-size:11px;padding:3px 9px;border-radius:999px;color:#d9c4ff;
  border:1px solid rgba(170,140,255,.34);background:rgba(120,90,255,.18)}

/* 总览 */
.wu-overview{display:flex;flex-direction:column;gap:14px;min-height:0}
.wu-model-card{padding-bottom:10px}
.wu-model-wrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;min-height:0}
.wu-model-legend{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;font-size:11px;color:var(--wu-muted)}
.wu-model-legend span{display:flex;align-items:center;gap:6px}

/* 动态横截面图 */
.wu-art{position:relative;width:100%;max-width:420px;aspect-ratio:1/1;border-radius:20px;overflow:hidden;isolation:isolate;
  border:1px solid rgba(150,180,255,.28);
  background:radial-gradient(70% 60% at 50% 40%, rgba(58,30,90,.9), rgba(8,10,32,.95));
  box-shadow:inset 0 1px 0 rgba(200,220,255,.16), 0 22px 56px rgba(3,6,30,.5)}
.wu-art-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;
  filter:saturate(1.08) contrast(1.04) brightness(1.02);
  animation:wu-breath var(--wu-breath-dur,4s) ease-in-out infinite;will-change:transform}
.wu-art-aura{position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;
  background:
    radial-gradient(58% 50% at 52% 42%, rgb(255 96 172 / calc(0.08 + var(--wu-heat,0) * 0.30)), transparent 66%),
    radial-gradient(76% 66% at 50% 98%, rgb(62 232 255 / calc(0.05 + var(--wu-fill,0) * 0.18)), transparent 72%)}
.wu-art-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.wu-art-flash{position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;opacity:0;
  background:radial-gradient(50% 46% at 50% 44%, rgba(255,255,255,.88), rgba(255,120,210,.4) 44%, transparent 74%);
  animation:wu-flash 1000ms ease-out both}
.wu-art-tag{position:absolute;right:10px;bottom:10px;font-size:11px;padding:2px 9px;border-radius:999px;color:#e8f4ff;
  background:rgba(8,12,38,.55);border:1px solid rgba(150,180,255,.3);backdrop-filter:blur(6px)}
.wu-cav-stroke{fill:none;stroke-width:1.4;filter:url(#wu-cav-glow);animation:wu-cav-pulse 2.6s ease-in-out infinite}
.wu-wave{animation-name:wu-wave-shift;animation-timing-function:linear;animation-iteration-count:infinite}
.wu-bubble{fill:rgba(255,255,255,.6);opacity:0;animation-name:wu-bubble-rise;animation-timing-function:ease-in;animation-iteration-count:infinite}
.wu-overflow{animation:wu-overflow-pulse 1.7s ease-in-out infinite}
.wu-scan{animation:wu-scan 5.5s linear infinite}

@keyframes wu-breath{0%,100%{transform:scale(1);filter:saturate(1.06) contrast(1.03) brightness(1)}50%{transform:scale(1.02);filter:saturate(1.18) contrast(1.07) brightness(1.06)}}
@keyframes wu-flash{0%{opacity:0}9%{opacity:.95}100%{opacity:0}}
@keyframes wu-cav-pulse{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes wu-wave-shift{from{transform:translateX(0)}to{transform:translateX(-48px)}}
@keyframes wu-bubble-rise{0%{transform:translateY(0);opacity:0}14%{opacity:.72}78%{opacity:.4}100%{transform:translateY(var(--wu-rise,-60px));opacity:0}}
@keyframes wu-overflow-pulse{0%,100%{opacity:.5;transform:translateY(0)}50%{opacity:.95;transform:translateY(2px)}}
@keyframes wu-scan{0%{transform:translateY(-24px);opacity:0}12%{opacity:.65}88%{opacity:.3}100%{transform:translateY(560px);opacity:0}}
.wu-swatch{width:9px;height:9px;border-radius:3px;display:inline-block}
.wu-swatch-blue{background:#5b6cff}.wu-swatch-purple{background:#a06bff}
.wu-swatch-pink{background:#ff6fd8}.wu-swatch-cyan{background:#3ee8ff}
.wu-model-foot{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}
.wu-legend-item{display:flex;flex-direction:column;gap:3px;padding:9px 10px;border-radius:11px;font-size:11.5px;color:var(--wu-muted);
  border:1px solid var(--wu-line);background:rgba(14,18,52,.45)}
.wu-legend-item span{font-size:12.5px;color:var(--wu-text);font-weight:600}

.wu-params{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.wu-param{display:flex;flex-direction:column;gap:5px;padding:11px 12px;border-radius:12px;
  border:1px solid var(--wu-line);background:linear-gradient(150deg, rgba(18,24,66,.55), rgba(28,20,62,.45))}
.wu-param-label{font-size:11.5px;color:var(--wu-muted)}
.wu-param-value{font-size:19px;line-height:1.25;font-weight:650;color:#f3f6ff;letter-spacing:.01em}
.wu-param-sub{font-size:11px;color:var(--wu-muted)}
.wu-text-clean{color:#9fe8ff}.wu-text-trace{color:#a8dcff}.wu-text-half{color:#c6b2ff}
.wu-text-full{color:#ffb0e6}.wu-text-burst{color:#ff86a8}
.wu-text-hot{color:#ff9ae5}.wu-text-cool{color:#9fd6ff}

.wu-meter{height:6px;border-radius:999px;background:rgba(10,14,42,.7);overflow:hidden;border:1px solid rgba(140,160,255,.16)}
.wu-meter-fill{height:100%;border-radius:999px;transition:width .5s ease}
.wu-tone-clean{background:linear-gradient(90deg,#3ee8ff,#8fd8ff)}
.wu-tone-trace{background:linear-gradient(90deg,#5ab6ff,#a8e2ff)}
.wu-tone-half{background:linear-gradient(90deg,#7a8bff,#b79cff)}
.wu-tone-full{background:linear-gradient(90deg,#c07bff,#ff8fdc)}
.wu-tone-burst{background:linear-gradient(90deg,#ff5f9f,#ff9ae5)}
.wu-tone-hot{background:linear-gradient(90deg,#ff6fd8,#ff5f9f)}
.wu-tone-cool{background:linear-gradient(90deg,#3ee8ff,#5b6cff)}
.wu-tone-purple{background:linear-gradient(90deg,#6d4dff,#b47bff)}
.wu-tone-cyan{background:linear-gradient(90deg,#3ee8ff,#7ce8ff)}

.wu-progress-block{grid-column:1/-1;display:grid;gap:7px;padding:12px;border-radius:12px;
  border:1px dashed rgba(150,170,255,.26);background:rgba(12,16,46,.4)}
.wu-progress-row{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:var(--wu-muted)}

/* 右侧事件 */
.wu-side{min-height:0;display:flex;flex-direction:column}
.wu-feed{display:flex;flex-direction:column;min-height:0;height:100%;padding-bottom:12px}
.wu-events{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;overflow-y:auto;min-height:0;flex:1;padding-right:2px}
.wu-events-full{max-height:none}
.wu-event{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:8px;align-items:start;
  padding:9px 10px;border-radius:11px;border:1px solid rgba(150,170,255,.16);background:rgba(12,16,46,.42)}
.wu-event-time{font-size:11px;color:var(--wu-muted);font-variant-numeric:tabular-nums;padding-top:2px}
.wu-dot{width:7px;height:7px;border-radius:50%;margin-top:6px;box-shadow:0 0 10px currentColor}
.wu-dot-hot{color:#ff6fd8;background:#ff6fd8}
.wu-dot-cool{color:#5b6cff;background:#5b6cff}
.wu-event-title{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;color:#f0f3ff}
.wu-event-body p{font-size:12px;line-height:1.62;color:var(--wu-muted);margin-top:4px;overflow-wrap:anywhere}
.wu-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.wu-tag{font-size:10.5px;padding:1px 7px;border-radius:999px;color:#ffd6f4;background:rgba(255,111,216,.2);border:1px solid rgba(255,111,216,.3)}
.wu-tag-soft{color:#d6d9ff;background:rgba(109,77,255,.2);border-color:rgba(150,140,255,.3)}
.wu-empty{font-size:12.5px;color:var(--wu-muted);padding:18px 4px}

/* 日志页 / 设置页 */
.wu-main{min-height:0;display:flex;flex-direction:column;gap:14px;overflow-y:auto;padding-right:2px}
.wu-log-page,.wu-settings{display:flex;flex-direction:column;gap:14px}
.wu-fields{display:grid;gap:11px}
.wu-field{display:grid;gap:5px;font-size:12.5px;color:var(--wu-text)}
.wu-field>span{display:flex;align-items:center;gap:7px}
.wu-field em,.wu-hint{font-style:normal;font-size:11.5px;color:var(--wu-muted);line-height:1.55}
.wu-unit{font-style:normal;font-size:10.5px;color:#c9b6ff;padding:1px 7px;border-radius:999px;background:rgba(120,90,255,.18);border:1px solid rgba(160,140,255,.24)}
.wu-field input[type=text],.wu-field input[type=number]{
  width:100%;padding:8px 11px;border-radius:10px;color:var(--wu-text);font-size:13px;
  border:1px solid rgba(150,170,255,.28);background:rgba(10,14,44,.62);outline:none}
.wu-field input:focus-visible{outline:2px solid rgba(255,140,225,.6);outline-offset:2px}
.wu-switch{display:inline-flex;align-items:center;gap:10px;font-size:12.5px;position:relative;cursor:pointer}
.wu-switch input{position:absolute;opacity:0;width:40px;height:22px;margin:0;cursor:pointer}
.wu-switch-track{width:40px;height:22px;border-radius:999px;background:rgba(12,16,46,.85);border:1px solid rgba(150,170,255,.3);
  display:block;padding:2px;transition:background .16s}
.wu-switch-track:before{content:'';display:block;width:16px;height:16px;border-radius:50%;background:linear-gradient(150deg,#dfe6ff,#98a8ff);
  transition:transform .16s;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.wu-switch input:checked+.wu-switch-track{background:linear-gradient(120deg,#6d4dff,#ff6fd8);border-color:rgba(255,150,225,.5)}
.wu-switch input:checked+.wu-switch-track:before{transform:translateX(18px);background:#fff}
.wu-voice-preview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px;padding:12px;border-radius:12px;
  border:1px solid var(--wu-line);background:rgba(14,18,52,.45)}
.wu-voice-params{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--wu-muted)}
.wu-voice-params span{padding:2px 8px;border-radius:999px;border:1px solid rgba(150,170,255,.22);background:rgba(90,110,255,.12)}
.wu-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}
.wu-btn{padding:8px 15px;border-radius:10px;font-size:12.5px;border:1px solid rgba(150,170,255,.3);
  background:linear-gradient(150deg, rgba(60,74,168,.6), rgba(40,32,96,.55));color:#eef2ff;transition:filter .15s,transform .15s}
.wu-btn:hover{filter:brightness(1.15)}
.wu-btn:disabled{opacity:.55;cursor:progress}
.wu-btn-primary{background:linear-gradient(120deg,#6d4dff,#c95bff 60%,#ff6fd8);border-color:rgba(255,160,230,.45)}
.wu-btn-danger{background:linear-gradient(120deg,rgba(120,30,70,.72),rgba(80,20,60,.6));border-color:rgba(255,110,140,.4);color:#ffd7e2}
.wu-status{font-size:11.5px}
.wu-status.is-ok{color:#8fe7c3}.wu-status.is-bad{color:#ff9fb0}

/* 侧边栏图标 */
.wu-panel-icon{display:block;color:currentColor}

/* 加载态 */
.wu-loading{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:40px}
.wu-loading-ring{width:44px;height:44px;border-radius:50%;border:2px solid rgba(150,170,255,.24);border-top-color:#ff6fd8;
  animation:wu-spin 1.1s linear infinite}
@keyframes wu-spin{to{transform:rotate(360deg)}}

@media (max-width:1240px){
  .wu-grid{grid-template-columns:170px minmax(0,1fr) 280px}
  .wu-params{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:1020px){
  .wu-grid{grid-template-columns:minmax(0,1fr)}
  .wu-nav{flex-direction:row;flex-wrap:wrap;align-self:auto}
  .wu-nav-foot{display:none}
  .wu-side{max-height:420px}
  .wu-model-foot{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:640px){
  .wu-params{grid-template-columns:minmax(0,1fr)}
  .wu-voice-preview{grid-template-columns:minmax(0,1fr)}
  .wu-root{padding:14px}
}
@media (prefers-reduced-motion:reduce){.wu-root *{animation:none!important;transition:none!important}}
`;

    /* ------------------------------------------------------------ 注册 */

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, Page));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 30,
          label: '鲸鱼娘生理拓展',
        }, PanelIcon));
      },
    };
  },
});
