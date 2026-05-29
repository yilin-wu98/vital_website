(function () {
  'use strict';

  /* ─── Method definitions (colors picked to match the published figure) ─── */
  const METHODS = [
    { key: 'base',    label: 'Base',                  group: 'base',    color: '#B0B0B0' },
    { key: 'vl8',     label: 'Visual Lookahead (8)',  group: 'visual',  color: '#C7DBEC' },
    { key: 'vl16',    label: 'Visual Lookahead (16)', group: 'visual',  color: '#5BACD8' },
    { key: 't_samp',  label: 'Tactile Sampling',      group: 'tactile', color: '#BFE2C0' },
    { key: 't_guide', label: 'Tactile Guidance',      group: 'tactile', color: '#6BB678' },
    { key: 'naive',   label: 'Naive Combination',     group: 'naive',   color: '#F2D5B5' },
    { key: 'ours',    label: 'Ours (ViTaL)',          group: 'ours',    color: '#E27A3F' },
  ];

  /* Means (read from the published figure). 0–100 percent. */
  const DATA = {
    Wiping: {
      Overall: { base:20, vl8:20, vl16:25, t_samp:40, t_guide:50, naive:50, ours:80 },
      Visual:  { base:50, vl8:60, vl16:80, t_samp:60, t_guide:60, naive:70, ours:90 },
      Contact: { base:30, vl8:30, vl16:35, t_samp:40, t_guide:50, naive:60, ours:90 },
    },
    Pipette: {
      Overall: { base:15, vl8:25, vl16:25, t_samp:35, t_guide:35, naive:40, ours:70 },
      Visual:  { base:45, vl8:60, vl16:80, t_samp:40, t_guide:50, naive:60, ours:80 },
      Contact: { base:30, vl8:35, vl16:40, t_samp:65, t_guide:70, naive:75, ours:75 },
    },
    Insertion: {
      Overall: { base:30, vl8:35, vl16:45, t_samp:45, t_guide:45, naive:55, ours:70 },
      Visual:  { base:55, vl8:65, vl16:75, t_samp:55, t_guide:55, naive:80, ours:75 },
      Contact: { base:40, vl8:45, vl16:50, t_samp:55, t_guide:60, naive:60, ours:80 },
    },
  };

  /* Auto-fill the 4th panel as the unweighted task average. */
  DATA.Average = {
    Overall: avgRow('Overall'),
    Visual:  avgRow('Visual'),
    Contact: avgRow('Contact'),
  };
  function avgRow(metric) {
    const row = {};
    METHODS.forEach(m => {
      const tasks = ['Wiping', 'Pipette', 'Insertion'];
      const vals = tasks.map(t => DATA[t][metric][m.key]);
      row[m.key] = vals.reduce((a, b) => a + b, 0) / vals.length;
    });
    return row;
  }

  const PANELS  = ['Wiping', 'Pipette', 'Insertion', 'Average'];
  const METRICS = ['Overall', 'Visual', 'Contact'];
  const N_TRIALS = 20;

  /* ─── Standard error of a proportion: sqrt(p(1-p)/n), p in [0,1]. ── */
  function stderr(p, n) {
    const se = Math.sqrt(p * (1 - p) / n);
    return { low: Math.max(0, p - se), high: Math.min(1, p + se) };
  }

  /* ─── Visibility filter ─── */
  function methodsForView(view) {
    if (view === 'all') return METHODS.map(m => m.key);
    if (view === 'visual')  return ['base', 'vl8', 'vl16', 'ours'];
    if (view === 'tactile') return ['base', 't_samp', 't_guide', 'ours'];
    if (view === 'naive')   return ['base', 'naive', 'ours'];
    return METHODS.map(m => m.key);
  }

  /* ─── DOM ─── */
  const viewSel = document.getElementById('rc-view');
  const content = document.getElementById('rc-content');
  const legend  = document.getElementById('rc-legend');
  const tooltip = document.getElementById('rc-tooltip');
  if (!viewSel || !content || !tooltip) return;

  /* ─── Build legend (grouped, filtered) ─── */
  const LEGEND_GROUPS = [
    { title: 'Base Policy',                  keys: ['base'] },
    { title: 'Visual Steering with Sampling', keys: ['vl8', 'vl16'] },
    { title: 'Tactile Steering',             keys: ['t_samp', 't_guide'] },
    { title: 'Multi-modal Guidance',         keys: ['naive', 'ours'] },
  ];

  function buildLegend(activeKeys) {
    legend.innerHTML = '';
    LEGEND_GROUPS.forEach(group => {
      const visible = group.keys.filter(k => activeKeys.includes(k));
      if (visible.length === 0) return;

      const groupEl = document.createElement('div');
      groupEl.className = 'rc-legend-group';

      const title = document.createElement('div');
      title.className = 'rc-legend-group-title';
      title.textContent = group.title;
      groupEl.appendChild(title);

      const items = document.createElement('div');
      items.className = 'rc-legend-group-items';

      visible.forEach(key => {
        const m = METHODS.find(x => x.key === key);
        const el = document.createElement('div');
        el.className = 'rc-legend-item';
        el.innerHTML = `<span class="rc-swatch" style="background:${m.color}"></span><span>${m.label}</span>`;
        items.appendChild(el);
      });

      groupEl.appendChild(items);
      legend.appendChild(groupEl);
    });
  }

  /* ─── State ─── */
  let dpr = window.devicePixelRatio || 1;
  let bars = [];           // hit-test cache: { panel, metric, methodKey, x, y, w, h, mean, lo, hi }
  let canvases = [];       // per-panel canvases

  /* ─── Render ─── */
  function render() {
    const view = viewSel.value;
    const activeKeys = methodsForView(view);
    buildLegend(activeKeys);

    content.innerHTML = '';
    canvases = [];

    const grid = document.createElement('div');
    grid.className = 'rc-grid';

    PANELS.forEach(panel => {
      const card = document.createElement('div');
      card.className = 'rc-panel';

      const h = document.createElement('div');
      h.className = 'rc-panel-title';
      h.textContent = panel;
      card.appendChild(h);

      const wrap = document.createElement('div');
      wrap.className = 'rc-canvas-wrap';
      const c = document.createElement('canvas');
      wrap.appendChild(c);
      card.appendChild(wrap);
      grid.appendChild(card);

      canvases.push({ panel, canvas: c, wrap });
    });

    content.appendChild(grid);
    drawAll(activeKeys);

    // Resize observer to redraw on layout change
    if ('ResizeObserver' in window && !render._ro) {
      render._ro = new ResizeObserver(() => drawAll(methodsForView(viewSel.value)));
      canvases.forEach(({ wrap }) => render._ro.observe(wrap));
    }
  }

  function drawAll(activeKeys) {
    bars = [];
    canvases.forEach(({ panel, canvas, wrap }) => {
      drawPanel(canvas, wrap, panel, activeKeys);
    });
  }

  function drawPanel(canvas, wrap, panel, activeKeys) {
    dpr = window.devicePixelRatio || 1;
    const W = wrap.getBoundingClientRect().width;
    const H = 230;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const PAD = { top: 14, bottom: 30, left: 36, right: 8 };
    const pw = W - PAD.left - PAD.right;
    const ph = H - PAD.top  - PAD.bottom;

    /* Y axis tick labels (0–100%, no gridlines) */
    ctx.fillStyle    = '#9ca3af';
    ctx.font         = '10px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'right';
    [0, 20, 40, 60, 80, 100].forEach(v => {
      const y = PAD.top + (1 - v / 100) * ph;
      ctx.fillText(v + '%', PAD.left - 4, y);
    });

    /* Bars: 3 metric groups across the panel, each with N visible methods. */
    const groupW = pw / METRICS.length;
    const innerPadFrac = 0.12;       // padding between metric groups
    const innerW = groupW * (1 - innerPadFrac);
    const visibleMethods = METHODS.filter(m => activeKeys.includes(m.key));
    const nMethods = visibleMethods.length;
    const barGap = 1.5;
    const barW = (innerW - barGap * (nMethods - 1)) / nMethods;

    METRICS.forEach((metric, mi) => {
      const groupX = PAD.left + mi * groupW + (groupW * innerPadFrac) / 2;

      /* Metric label */
      ctx.fillStyle    = '#374151';
      ctx.font         = '11px Inter, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(metric, groupX + innerW / 2, PAD.top + ph + 6);

      visibleMethods.forEach((m, bi) => {
        const meanPct = DATA[panel][metric][m.key];           // 0–100
        const { low, high } = stderr(meanPct / 100, N_TRIALS);
        const x = groupX + bi * (barW + barGap);
        const yTop = PAD.top + (1 - meanPct / 100) * ph;
        const barHeight = (PAD.top + ph) - yTop;

        /* Bar */
        ctx.fillStyle = m.color;
        ctx.fillRect(x, yTop, barW, barHeight);
        ctx.strokeStyle = '#0008';
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(x + 0.25, yTop + 0.25, barW - 0.5, barHeight - 0.5);

        /* Error bar (Wilson CI) */
        const yLo = PAD.top + (1 - high * 100 / 100) * ph;
        const yHi = PAD.top + (1 - low  * 100 / 100) * ph;
        const cx  = x + barW / 2;
        ctx.strokeStyle = '#374151';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(cx, yLo); ctx.lineTo(cx, yHi);
        const cap = Math.min(barW * 0.4, 5);
        ctx.moveTo(cx - cap, yLo); ctx.lineTo(cx + cap, yLo);
        ctx.moveTo(cx - cap, yHi); ctx.lineTo(cx + cap, yHi);
        ctx.stroke();

        bars.push({
          panel, metric, method: m,
          x, y: yTop, w: barW, h: barHeight,
          mean: meanPct, low: low * 100, high: high * 100,
          canvas,
        });
      });
    });

    /* Plot border */
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1;
    ctx.strokeRect(PAD.left, PAD.top, pw, ph);
  }

  /* ─── Hover tooltip ─── */
  function showTooltip(bar, clientX, clientY) {
    const k = Math.round(bar.mean / 100 * N_TRIALS);
    const se = (bar.high - bar.mean);
    tooltip.innerHTML =
      `<div class="rc-tt-title"><span class="rc-tt-dot" style="background:${bar.method.color}"></span>${bar.method.label}</div>` +
      `<div class="rc-tt-row"><span>${bar.panel} — ${bar.metric}</span></div>` +
      `<div class="rc-tt-row rc-tt-strong">${bar.mean.toFixed(0)}% ± ${se.toFixed(1)}%  (${k}/${N_TRIALS})</div>` +
      `<div class="rc-tt-row rc-tt-muted">SE = √(p(1−p)/${N_TRIALS})</div>`;
    tooltip.style.display = 'block';
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    let x = clientX + 14, y = clientY + 14;
    if (x + tw > window.innerWidth - 8) x = clientX - tw - 14;
    if (y + th > window.innerHeight - 8) y = clientY - th - 14;
    tooltip.style.left = x + 'px';
    tooltip.style.top  = y + 'px';
  }
  function hideTooltip() { tooltip.style.display = 'none'; }

  function hitTest(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left, cy = clientY - rect.top;
    return bars.find(b => b.canvas === canvas
                       && cx >= b.x && cx <= b.x + b.w
                       && cy >= b.y && cy <= b.y + b.h);
  }

  document.addEventListener('mousemove', e => {
    const cv = e.target.closest && e.target.closest('canvas');
    if (!cv || !canvases.some(c => c.canvas === cv)) { hideTooltip(); return; }
    const hit = hitTest(cv, e.clientX, e.clientY);
    if (hit) showTooltip(hit, e.clientX, e.clientY);
    else hideTooltip();
  });
  document.addEventListener('mouseleave', hideTooltip);
  window.addEventListener('scroll', hideTooltip, { passive: true });

  viewSel.addEventListener('change', render);
  window.addEventListener('resize', () => render());

  render();
})();
