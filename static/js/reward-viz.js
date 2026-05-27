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

  /* ─── Colour palettes ─── */
  const V_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#b45309'];
  const T_COLORS = ['#ea580c', '#dc2626', '#ca8a04', '#be185d', '#0f766e'];

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

  /* ─── Synthetic demo data ─── */
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

    /* Visual phases: two competing goals that rise at different times */
    const vShapes = [
      i => sigmoid((i - 18) / 7) * 0.88 + (i > 55 ? -0.3 : 0),
      i => Math.max(0, sigmoid((i - 45) / 7) * 0.92 - sigmoid((i - 72) / 5) * 0.5),
      i => bump(i, 35, 12) * 0.85 + sigmoid((i - 60) / 8) * 0.4,
    ];

    /* Tactile phases: contact quality over time */
    const tShapes = [
      i => i < 28 ? bump(i, 14, 10) * 0.80 : Math.max(0, 0.1 - (i - 28) * 0.003),
      i => bump(i, 46, 16) * 0.93 + (i > 35 && i < 58 ? 0.06 : 0),
      i => Math.max(0, 0.12 - bump(i, 46, 16) * 0.12 + sigmoid((i - 62) / 6) * 0.08),
    ];

    const visual_phases = ph.visual.map((label, pi) => ({
      label,
      gt_reward:   mk(vShapes[pi % vShapes.length], 0.03),
      pred_reward: mk(i => vShapes[pi % vShapes.length](i) - 0.04 + wave(i, s + pi) * 0.04, 0.06),
    }));

    const tactile_phases = ph.tactile.map((label, pi) => ({
      label,
      gt_reward:   mk(tShapes[pi % tShapes.length], 0.04),
      pred_reward: mk(i => tShapes[pi % tShapes.length](i) - 0.03 + wave(i, s + pi + 5) * 0.04, 0.07),
    }));

    return {
      n_steps: n,
      visual_gt_frames: [], visual_pred_frames: [],
      tactile_gt_frames: [], tactile_pred_frames: [],
      visual_phases,
      tactile_phases,
    };
  }

  /* ─── Load (real JSON or demo fallback) ─── */
  function loadData(task, trial) {
    fetch(`static/reward_data/${task}/trial_${trial}.json`)
      .then(r => { if (!r.ok) throw 0; return r.json(); })
      .then(j  => { data = j;                       init(); })
      .catch(() => { data = makeDemoData(task, trial); init(); });
  }

  /* ─── Initialise after data loads ─── */
  function init() {
    const n = data.n_steps;
    scrubber.min = 0;
    scrubber.max = n - 1;
    scrubber.value = 0;
    maxLabel.textContent = `t = ${n - 1}`;
    step = 0;
    resizeCanvases();
    buildLegends();
    renderAll();
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
  function buildLegend(el, phases, colors) {
    el.innerHTML = '';

    /* Left column: line-style guide */
    const styleCol = document.createElement('div');
    styleCol.className = 'rv-legend-col';
    styleCol.innerHTML = `<div class="rv-legend-heading">Line Style</div>`;
    [
      { label: 'Ground Truth', dash: '' },
      { label: 'Predicted',    dash: '5,4' },
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

    /* Right column: phase objectives */
    const phaseCol = document.createElement('div');
    phaseCol.className = 'rv-legend-col';
    phaseCol.innerHTML = `<div class="rv-legend-heading">Phase Objectives</div>`;
    phases.forEach((p, pi) => {
      const col  = colors[pi % colors.length];
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
    buildLegend(legendEls.visual,  data.visual_phases,  V_COLORS);
    buildLegend(legendEls.tactile, data.tactile_phases, T_COLORS);
  }

  /* ─── Draw one reward plot ─── */
  function drawPlot(ctx, canvasEl, phases, colors) {
    const W   = canvasEl.width  / dpr;
    const H   = canvasEl.height / dpr;
    const PAD = { top: 12, bottom: 22, left: 46, right: 10 };
    const pw  = W - PAD.left - PAD.right;
    const ph  = H - PAD.top  - PAD.bottom;
    const n   = data.n_steps;

    ctx.clearRect(0, 0, W, H);

    /* ── auto-scale Y from all curves ── */
    let yMin = Infinity, yMax = -Infinity;
    phases.forEach(p => {
      [...p.gt_reward, ...p.pred_reward].forEach(v => {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      });
    });
    if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
    const span = yMax - yMin || 0.1;
    yMin = Math.max(0, yMin - span * 0.06);
    yMax = yMax + span * 0.06;

    const xOf = i => PAD.left + (i / (n - 1)) * pw;
    const yOf = v => PAD.top  + (1 - (v - yMin) / (yMax - yMin)) * ph;

    /* ── grid & axes ── */
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

    /* ── Draw curves ── */
    phases.forEach((p, pi) => {
      const col = colors[pi % colors.length];

      /* GT — solid, full opacity */
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth   = 2;
      ctx.lineJoin    = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      p.gt_reward.forEach((v, i) => {
        i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v));
      });
      ctx.stroke();
      ctx.restore();

      /* Predicted — dashed, slightly dimmed */
      ctx.save();
      ctx.strokeStyle  = col;
      ctx.lineWidth    = 1.5;
      ctx.globalAlpha  = 0.60;
      ctx.setLineDash([5, 4]);
      ctx.lineJoin     = 'round';
      ctx.beginPath();
      p.pred_reward.forEach((v, i) => {
        i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v));
      });
      ctx.stroke();
      ctx.restore();
    });

    /* ── Cursor (vertical rule at current step) ── */
    const cx = xOf(step);
    ctx.save();
    ctx.strokeStyle = '#374151';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + ph);
    ctx.stroke();
    ctx.restore();

    /* ── Dots at cursor for each curve ── */
    phases.forEach((p, pi) => {
      const col = colors[pi % colors.length];
      [
        { arr: p.gt_reward,   r: 4.5 },
        { arr: p.pred_reward, r: 3.5 },
      ].forEach(({ arr, r }) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, yOf(arr[step]), r, 0, Math.PI * 2);
        ctx.fillStyle   = col;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        ctx.restore();
      });
    });
  }

  /* ─── Render both plots + images ─── */
  function renderAll() {
    if (!data) return;
    drawPlot(vCtx, vCanvas, data.visual_phases,  V_COLORS);
    drawPlot(tCtx, tCanvas, data.tactile_phases, T_COLORS);
    updateImages();
    stepLabel.textContent = step;
    scrubber.value = step;
  }

  /* ─── Frame images ─── */
  function setFrame(img, ph, src) {
    if (src) {
      img.src = src;
      img.style.display = 'block';
      ph.style.display  = 'none';
    } else {
      img.style.display = 'none';
      ph.style.display  = 'flex';
    }
  }
  function updateImages() {
    const vgt   = (data.visual_gt_frames    || [])[step];
    const vpred = (data.visual_pred_frames  || [])[step];
    const tgt   = (data.tactile_gt_frames   || [])[step];
    const tpred = (data.tactile_pred_frames || [])[step];
    setFrame(imgs.vgt,   phs.vgt,   vgt);
    setFrame(imgs.vpred, phs.vpred, vpred);
    setFrame(imgs.tgt,   phs.tgt,   tgt);
    setFrame(imgs.tpred, phs.tpred, tpred);
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

  /* ─── Scrubber input ─── */
  scrubber.addEventListener('input', () => { step = Number(scrubber.value); renderAll(); });

  /* ─── Selectors ─── */
  taskSel.addEventListener('change',  () => loadData(taskSel.value, trialSel.value));
  trialSel.addEventListener('change', () => loadData(taskSel.value, trialSel.value));

  /* ─── Resize ─── */
  window.addEventListener('resize', () => { resizeCanvases(); renderAll(); });

  /* ─── Boot ─── */
  loadData(taskSel.value, trialSel.value);
})();
