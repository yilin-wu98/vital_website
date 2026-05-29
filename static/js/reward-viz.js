/**
 * ViTaL Interactive Reward Visualizer
 *
 * Two independent plots (visual reward / tactile reward) with separate Y-scales.
 * Each plot shows one curve per textual phase objective:
 *   solid line  = Ground Truth reward (from real observations)
 *   dashed line = Predicted reward (from world-model predictions)
 *
 * Data file: static/reward_data/{task}/trial_{N}.json
 * See static/reward_data/schema.json for the full format.
 */
(function () {
  'use strict';

  /* ─── Colour palettes (match plot_reward_curves_corl.py) ─── */
  const LABEL_COLORS = {
    'yellow cup':       '#E8C320',
    'blue cup':         '#5BACD8',
    'grasp lightly':    '#E8C320',
    'grasp heavily':    '#FB7869',
    'orange marks':     '#EA580C',
    'black marks':      '#374151',
    'wipe the board':   '#16A34A',
    'top-left corner':  '#7C3AED',
    'top-right corner': '#DB2777',
    'insert the peg':   '#16A34A',
  };
  const PHASE2_COLOR = '#FB7869';
  const FALLBACK_VIS = ['#2563eb', '#1d4ed8', '#3b82f6', '#0284c7', '#6366f1'];
  const FALLBACK_TAC = ['#16a34a', '#15803d', '#22c55e', '#059669', '#047857'];

  /* ─── DOM ─── */
  const taskSel   = document.getElementById('rv-task');
  const trialSel  = document.getElementById('rv-trial');
  const scrubber  = document.getElementById('rv-scrubber');
  const stepLabel = document.getElementById('rv-step-label');
  const maxLabel  = document.getElementById('rv-scrubber-max');

  const vWrap  = document.getElementById('rv-visual-canvas').parentElement;
  const tWrap  = document.getElementById('rv-tactile-canvas').parentElement;
  const vCanvas = document.getElementById('rv-visual-canvas');
  const tCanvas = document.getElementById('rv-tactile-canvas');
  const vCtx   = vCanvas.getContext('2d');
  const tCtx   = tCanvas.getContext('2d');

  const imgs = {
    vgt:   document.getElementById('rv-vgt-img'),
    vpred: document.getElementById('rv-vpred-img'),
    tgt:   document.getElementById('rv-tgt-img'),
    tpred: document.getElementById('rv-tpred-img'),
  };
  const vids = {
    vgt:   document.getElementById('rv-vgt-vid'),
    vpred: document.getElementById('rv-vpred-vid'),
    tgt:   document.getElementById('rv-tgt-vid'),
    tpred: document.getElementById('rv-tpred-vid'),
  };
  const phs = {
    vgt:   document.getElementById('rv-vgt-ph'),
    vpred: document.getElementById('rv-vpred-ph'),
    tgt:   document.getElementById('rv-tgt-ph'),
    tpred: document.getElementById('rv-tpred-ph'),
  };
  const legendEls = {
    visual:  document.getElementById('rv-legend-visual'),
    tactile: document.getElementById('rv-legend-tactile'),
  };

  /* ─── State ─── */
  let data = null;
  let step = 0;
  let dpr  = window.devicePixelRatio || 1;
  let dragging = false;
  let activeCanvas = null;

  /* ─── Synthetic demo data (fallback when no JSON available) ─── */
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  const bump    = (i, c, w) => Math.exp(-0.5 * ((i - c) / w) ** 2);
  const wave    = (i, s)    => Math.sin(i * 1.7 + s * 2.3) * 0.5;
  const clamp   = v => Math.max(0, Math.min(1, v));

  const DEMO_PHASES = {
    pipette: {
      visual:  ['transfer to yellow cup', 'transfer to blue cup'],
      tactile: ['light contact', 'adequate force', 'excessive force'],
    },
    wiping: {
      visual:  ['approach surface', 'wipe target area', 'return home'],
      tactile: ['no contact', 'adequate pressure', 'excessive force'],
    },
    insertion: {
      visual:  ['approach hole', 'insert peg'],
      tactile: ['no contact', 'guiding contact', 'insertion force'],
    },
  };

  function makeDemoData(task, trial) {
    const n = 80;
    const s = task.charCodeAt(0) * 0.13 + Number(trial) * 2.9;
    const mk = (fn, σ) => Array.from({ length: n }, (_, i) => clamp(fn(i) + wave(i, s) * σ));

    const ph = DEMO_PHASES[task] || DEMO_PHASES.pipette;

    const vShapes = [
      i => sigmoid((i - 18) / 7) * 0.88 + (i > 55 ? -0.3 : 0),
      i => Math.max(0, sigmoid((i - 45) / 7) * 0.92 - sigmoid((i - 72) / 5) * 0.5),
      i => bump(i, 35, 12) * 0.85 + sigmoid((i - 60) / 8) * 0.4,
    ];
    const tShapes = [
      i => i < 28 ? bump(i, 14, 10) * 0.80 : Math.max(0, 0.1 - (i - 28) * 0.003),
      i => bump(i, 46, 16) * 0.93 + (i > 35 && i < 58 ? 0.06 : 0),
      i => Math.max(0, 0.12 - bump(i, 46, 16) * 0.12 + sigmoid((i - 62) / 6) * 0.08),
    ];

    return {
      n_steps: n,
      visual_phases: ph.visual.map((label, pi) => ({
        label,
        gt_reward:   mk(vShapes[pi % vShapes.length], 0.03),
        pred_reward: mk(i => vShapes[pi % vShapes.length](i) - 0.04 + wave(i, s + pi) * 0.04, 0.06),
      })),
      tactile_phases: ph.tactile.map((label, pi) => ({
        label,
        gt_reward:   mk(tShapes[pi % tShapes.length], 0.04),
        pred_reward: mk(i => tShapes[pi % tShapes.length](i) - 0.03 + wave(i, s + pi + 5) * 0.04, 0.07),
      })),
    };
  }

  /* ─── Color resolution ─── */
  function resolveColor(label, idx, fallback) {
    const k = label.toLowerCase();
    if (LABEL_COLORS[k]) return LABEL_COLORS[k];
    // Match sub-strings so e.g. "transfer liquid to the blue cup" resolves to blue.
    for (const key of Object.keys(LABEL_COLORS)) {
      if (k.includes(key)) return LABEL_COLORS[key];
    }
    return fallback[idx % fallback.length];
  }

  /* ─── Load (real JSON or demo fallback) ─── */
  function loadData(task, trial) {
    const bust = `?_=${Date.now()}`;
    fetch(`static/reward_data/${task}/trial_${trial}.json${bust}`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw 0; return r.json(); })
      .then(j  => { data = j; init(); })
      .catch(() => { data = makeDemoData(task, trial); init(); });
  }

  /* ─── Initialise after data loads ─── */
  function init() {
    const n = data.n_steps;
    scrubber.min = 0;
    scrubber.max = n - 1;
    scrubber.value = 0;
    maxLabel.textContent = `t = ${n - 1}`;
    step = 0;
    bindVideos();
    resizeCanvases();
    buildLegends();
    renderAll();
  }

  /* ─── Wire up the 4 obs videos (or fall back to images) ─── */
  function bindVideos() {
    const map = [
      ['vgt',   'visual_gt_video',   'visual_gt_frames'],
      ['vpred', 'visual_pred_video', 'visual_pred_frames'],
      ['tgt',   'tactile_gt_video',  'tactile_gt_frames'],
      ['tpred', 'tactile_pred_video','tactile_pred_frames'],
    ];
    map.forEach(([key, vidKey, framesKey]) => {
      const v = vids[key], img = imgs[key], ph = phs[key];
      const vidSrc    = data[vidKey];
      const hasFrames = (data[framesKey] || []).length > 0;
      v.style.display = 'none';
      img.style.display = 'none';
      ph.style.display = 'flex';
      if (vidSrc) {
        v.pause();
        v.removeAttribute('autoplay');
        v.src = vidSrc;
        v.load();
        v.style.display = 'block';
        ph.style.display = 'none';
        // seek to step 0 once metadata is available
        v.addEventListener('loadedmetadata', () => {
          try { v.pause(); v.currentTime = step / (data.fps || 5); } catch (_) {}
        }, { once: true });
      } else if (hasFrames) {
        ph.style.display = 'none';
      }
    });
  }

  /* ─── Canvas sizing ─── */
  function resizeCanvases() {
    dpr = window.devicePixelRatio || 1;
    [[vCanvas, vCtx, vWrap], [tCanvas, tCtx, tWrap]].forEach(([c, ctx, wrap]) => {
      const w = wrap.getBoundingClientRect().width;
      c.width  = w   * dpr;
      c.height = 210 * dpr;
      c.style.height = '210px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }

  /* ─── Build HTML legend for one plot ─── */
  function buildLegend(el, phases, colorFor) {
    el.innerHTML = '';

    const styleCol = document.createElement('div');
    styleCol.className = 'rv-legend-col';
    styleCol.innerHTML = `<div class="rv-legend-heading">Line Style</div>`;
    [
      { label: 'Ground Truth', dash: '2,3' },
      { label: 'Predicted',    dash: '' },
    ].forEach(({ label, dash }) => {
      const item = document.createElement('div');
      item.className = 'rv-legend-item';
      item.innerHTML =
        `<svg width="26" height="12" style="flex-shrink:0" viewBox="0 0 26 12">` +
        `<line x1="1" y1="6" x2="25" y2="6" stroke="#6b7280" stroke-width="2.5"` +
        (dash ? ` stroke-dasharray="${dash}"` : '') + ` stroke-linecap="round"/></svg>` +
        `<span>${label}</span>`;
      styleCol.appendChild(item);
    });
    el.appendChild(styleCol);

    const phaseCol = document.createElement('div');
    phaseCol.className = 'rv-legend-col';
    phaseCol.innerHTML = `<div class="rv-legend-heading">Phase Objectives</div>`;
    const seen = new Set();
    phases.forEach((p, pi) => {
      if (seen.has(p.label)) return;
      seen.add(p.label);
      const col  = colorFor(p.label, pi);
      const item = document.createElement('div');
      item.className = 'rv-legend-item';
      item.innerHTML =
        `<span class="rv-legend-swatch" style="background:${col}"></span>` +
        `<span>${p.label}</span>`;
      phaseCol.appendChild(item);
    });
    el.appendChild(phaseCol);
  }

  function buildLegends() {
    buildLegend(legendEls.visual,  data.visual_phases,
                (lbl, i) => {
                  const phase = data.visual_phases[i] && data.visual_phases[i].phase;
                  if (phase === 2) return PHASE2_COLOR;
                  return resolveColor(lbl, i, FALLBACK_VIS);
                });
    buildLegend(legendEls.tactile, data.tactile_phases,
                (lbl, i) => resolveColor(lbl, i, FALLBACK_TAC));
  }

  /* ─── Curve drawing helpers ─── */
  const isNum = v => typeof v === 'number' && !isNaN(v);

  function drawCurve(ctx, arr, xOf, yOf, color, dashed, alpha) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = dashed ? 1.5 : 2;
    ctx.globalAlpha = alpha;
    ctx.setLineDash(dashed ? [2, 3] : []);
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    let started = false;
    arr.forEach((v, i) => {
      if (!isNum(v)) { started = false; return; }
      const x = xOf(i), y = yOf(v);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else          { ctx.lineTo(x, y); }
    });
    ctx.stroke();
    ctx.restore();
  }

  /* ─── Draw one reward plot ─── */
  function drawPlot(ctx, canvasEl, phases, fallback, opts) {
    const W   = canvasEl.width  / dpr;
    const H   = canvasEl.height / dpr;
    const PAD = { top: 12, bottom: 22, left: 46, right: 10 };
    const pw  = W - PAD.left - PAD.right;
    const ph  = H - PAD.top  - PAD.bottom;
    const n   = data.n_steps;

    ctx.clearRect(0, 0, W, H);

    /* ── Y range ── */
    let yMin, yMax;
    if (opts && opts.yRange) {
      [yMin, yMax] = opts.yRange;
    } else {
      yMin = Infinity; yMax = -Infinity;
      phases.forEach(p => {
        [...p.gt_reward, ...p.pred_reward].forEach(v => {
          if (!isNum(v)) return;
          if (v < yMin) yMin = v;
          if (v > yMax) yMax = v;
        });
      });
      if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
      const span = yMax - yMin || 0.1;
      yMin = yMin - span * 0.06;
      yMax = yMax + span * 0.06;
    }

    const xOf = i => PAD.left + (i / (n - 1)) * pw;
    const yOf = v => PAD.top  + (1 - (v - yMin) / (yMax - yMin)) * ph;

    /* ── Phase shading (only when phase_transition_x is provided) ── */
    if (opts && opts.phaseShading && data.phase_transition_x != null) {
      const xT = data.phase_transition_x;
      const xC = (data.threshold_cross_x != null) ? data.threshold_cross_x : xT;
      ctx.save();
      // pre-threshold: light yellow
      ctx.fillStyle = 'rgba(255, 244, 194, 0.45)';
      ctx.fillRect(PAD.left, PAD.top, xOf(xC) - PAD.left, ph);
      // threshold→phase2: darker yellow
      ctx.fillStyle = 'rgba(245, 224, 140, 0.45)';
      ctx.fillRect(xOf(xC), PAD.top, xOf(xT) - xOf(xC), ph);
      // phase2: light red
      ctx.fillStyle = 'rgba(253, 222, 222, 0.45)';
      ctx.fillRect(xOf(xT), PAD.top, PAD.left + pw - xOf(xT), ph);
      ctx.restore();
    }

    /* ── Grid ── */
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);
    const nTicks = 4;
    for (let k = 0; k <= nTicks; k++) {
      const v = yMin + (k / nTicks) * (yMax - yMin);
      const y = yOf(v);
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + pw, y); ctx.stroke();
      ctx.fillStyle    = '#9ca3af';
      ctx.font         = '9px Inter, sans-serif';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(2), PAD.left - 5, y);
    }

    /* X-axis tick labels */
    ctx.fillStyle    = '#9ca3af';
    ctx.font         = '9px Inter, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(3 * n / 4), n - 1].forEach(i => {
      ctx.fillText(i, xOf(i), PAD.top + ph + 4);
    });

    /* Plot border */
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth   = 1;
    ctx.strokeRect(PAD.left, PAD.top, pw, ph);

    /* ── Threshold line (visual plot only) ── */
    if (opts && opts.threshold != null && data.threshold != null) {
      const yThr = yOf(data.threshold);
      if (yThr >= PAD.top && yThr <= PAD.top + ph) {
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([4, 2, 1, 2]);
        ctx.beginPath();
        ctx.moveTo(PAD.left, yThr);
        ctx.lineTo(PAD.left + pw, yThr);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle    = '#1f2937';
        ctx.font         = '9px Inter, sans-serif';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`threshold=${data.threshold}`, PAD.left + pw - 4, yThr - 2);
      }
    }

    /* ── Curves ── */
    phases.forEach((p, pi) => {
      let color = resolveColor(p.label, pi, fallback);
      if (opts && opts.phaseShading && p.phase === 2) color = PHASE2_COLOR;

      drawCurve(ctx, p.gt_reward,   xOf, yOf, color, true,  0.7);
      drawCurve(ctx, p.pred_reward, xOf, yOf, color, false, 1.0);
    });

    /* ── Cursor ── */
    const cx = xOf(step);
    ctx.save();
    ctx.strokeStyle = '#374151';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + ph);
    ctx.stroke();
    ctx.restore();

    /* ── Cursor dots (only for curves with valid values at this step) ── */
    phases.forEach((p, pi) => {
      let color = resolveColor(p.label, pi, fallback);
      if (opts && opts.phaseShading && p.phase === 2) color = PHASE2_COLOR;
      [
        { arr: p.gt_reward,   r: 4.5 },
        { arr: p.pred_reward, r: 3.5 },
      ].forEach(({ arr, r }) => {
        const v = arr[step];
        if (!isNum(v)) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, yOf(v), r, 0, Math.PI * 2);
        ctx.fillStyle   = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        ctx.restore();
      });
    });
  }

  /* ─── Render both plots + frames ─── */
  function renderAll() {
    if (!data) return;
    drawPlot(vCtx, vCanvas, data.visual_phases,  FALLBACK_VIS,
             { phaseShading: true,  threshold: data.threshold });
    drawPlot(tCtx, tCanvas, data.tactile_phases, FALLBACK_TAC,
             { phaseShading: true });
    updateFrames();
    stepLabel.textContent = step;
    scrubber.value = step;
  }

  /* ─── Frame seeking (videos preferred, image fallback) ─── */
  function seekVideo(v, t) {
    if (!v.src) return;
    const apply = () => {
      try {
        v.pause();
        const dur = isFinite(v.duration) ? v.duration : t;
        const target = Math.min(Math.max(0, t), Math.max(0, dur - 0.001));
        // Force the browser to repaint even if the new currentTime is very
        // close to the old one (Safari/Chrome will sometimes coalesce seeks).
        v.currentTime = target;
      } catch (_) {}
    };
    if (v.readyState >= 1) apply();
    else v.addEventListener('loadedmetadata', apply, { once: true });
  }

  function updateFrames() {
    const fps = data.fps || 5;
    // Half-frame offset: aim at the middle of frame N rather than its boundary,
    // which avoids landing on the previous frame due to floating-point rounding.
    const t = (step + 0.5) / fps;
    Object.values(vids).forEach(v => {
      if (v.src) seekVideo(v, t);
    });

    /* Image-frame fallback (if no video provided) */
    const setImg = (img, ph, src) => {
      if (src && !vids[Object.keys(imgs).find(k => imgs[k] === img)].src) {
        img.src = src;
        img.style.display = 'block';
        ph.style.display  = 'none';
      }
    };
    setImg(imgs.vgt,   phs.vgt,   (data.visual_gt_frames    || [])[step]);
    setImg(imgs.vpred, phs.vpred, (data.visual_pred_frames  || [])[step]);
    setImg(imgs.tgt,   phs.tgt,   (data.tactile_gt_frames   || [])[step]);
    setImg(imgs.tpred, phs.tpred, (data.tactile_pred_frames || [])[step]);
  }

  /* ─── Seek by clicking / dragging on a canvas ─── */
  function seekOnCanvas(canvasEl, clientX) {
    const rect  = canvasEl.getBoundingClientRect();
    const W     = canvasEl.width / dpr;
    const PAD_L = 46, PAD_R = 10;
    const pw    = W - PAD_L - PAD_R;
    const frac  = Math.max(0, Math.min(1, (clientX - rect.left - PAD_L) / pw));
    step = Math.round(frac * (data.n_steps - 1));
    renderAll();
  }

  [vCanvas, tCanvas].forEach(c => {
    c.addEventListener('mousedown', e => {
      dragging = true; activeCanvas = c; seekOnCanvas(c, e.clientX);
    });
    c.addEventListener('touchstart', e => {
      e.preventDefault(); seekOnCanvas(c, e.touches[0].clientX);
    }, { passive: false });
    c.addEventListener('touchmove', e => {
      e.preventDefault(); seekOnCanvas(c, e.touches[0].clientX);
    }, { passive: false });
  });

  window.addEventListener('mousemove', e => {
    if (dragging && activeCanvas) seekOnCanvas(activeCanvas, e.clientX);
  });
  window.addEventListener('mouseup', () => { dragging = false; activeCanvas = null; });

  scrubber.addEventListener('input', () => { step = Number(scrubber.value); renderAll(); });

  taskSel.addEventListener('change',  () => loadData(taskSel.value, trialSel.value));
  trialSel.addEventListener('change', () => loadData(taskSel.value, trialSel.value));

  window.addEventListener('resize', () => { resizeCanvases(); renderAll(); });

  loadData(taskSel.value, trialSel.value);
})();
