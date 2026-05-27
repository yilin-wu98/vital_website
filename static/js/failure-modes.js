/**
 * Failure Mode Analysis
 *
 * Populates #fm-content based on the selected Task + Baseline dropdowns.
 *
 * Video convention:
 *   static/videos/failure/{task}/{baseline}/fail_{N:02d}.mp4
 *
 * To add real videos, drop files at the paths above and update the
 * FM_DATA descriptions / video counts below.
 */
(function () {
  'use strict';

  /* ─── Content metadata ───────────────────────────────────────────────
   * Each entry: { description, videos: [{label, file}] }
   * `file` is the filename inside static/videos/failure/{task}/{baseline}/
   * ─────────────────────────────────────────────────────────────────── */
  const FM_DATA = {
    pipette: {
      base_policy: {
        description:
          '<strong>Base Policy</strong> frequently selects the wrong target cup ' +
          'and applies inconsistent contact force during grasping, leading to slip ' +
          'failures and incorrect liquid transfer.',
        videos: [
          { label: 'Wrong cup selected',    file: 'fail_01.mp4' },
          { label: 'Slip during grasp',     file: 'fail_02.mp4' },
          { label: 'Insufficient force',    file: 'fail_03.mp4' },
        ],
      },
      visual_steering: {
        description:
          '<strong>Visual Steering</strong> correctly identifies the target cup ' +
          'but cannot detect inadequate contact force from RGB images alone, ' +
          'resulting in drops and incomplete dispensing.',
        videos: [
          { label: 'Drop due to low force',    file: 'fail_01.mp4' },
          { label: 'Excessive squeeze / spill', file: 'fail_02.mp4' },
          { label: 'Unstable grasp at dispense', file: 'fail_03.mp4' },
        ],
      },
      tactile_steering: {
        description:
          '<strong>Tactile Steering</strong> maintains good contact quality but ' +
          'lacks global task context, causing the robot to approach the wrong ' +
          'cup or lose track of the task phase.',
        videos: [
          { label: 'Wrong cup, correct grasp', file: 'fail_01.mp4' },
          { label: 'Phase confusion',          file: 'fail_02.mp4' },
          { label: 'Over-refined at wrong loc', file: 'fail_03.mp4' },
        ],
      },
      naive_multimodal: {
        description:
          '<strong>Naive Multimodal</strong> fusion averages visual and tactile ' +
          'signals over a shared horizon, causing conflicts between long-horizon ' +
          'goals and short-horizon contact corrections.',
        videos: [
          { label: 'Signal conflict / stall',  file: 'fail_01.mp4' },
          { label: 'Premature tactile override', file: 'fail_02.mp4' },
          { label: 'Late-stage mode confusion', file: 'fail_03.mp4' },
        ],
      },
    },

    wiping: {
      base_policy: {
        description:
          '<strong>Base Policy</strong> applies erratic contact force during wiping, ' +
          'either barely touching the surface or pressing too hard and losing control.',
        videos: [
          { label: 'No surface contact',   file: 'fail_01.mp4' },
          { label: 'Excessive force',      file: 'fail_02.mp4' },
          { label: 'Incomplete coverage',  file: 'fail_03.mp4' },
        ],
      },
      visual_steering: {
        description:
          '<strong>Visual Steering</strong> tracks the wipe trajectory well ' +
          'visually but cannot verify adequate surface pressure, often completing ' +
          'the motion without meaningful contact.',
        videos: [
          { label: 'Trajectory ok, no contact',   file: 'fail_01.mp4' },
          { label: 'Hover without pressing',       file: 'fail_02.mp4' },
          { label: 'Force drops mid-wipe',         file: 'fail_03.mp4' },
        ],
      },
      tactile_steering: {
        description:
          '<strong>Tactile Steering</strong> maintains correct pressure but ' +
          'cannot plan a complete wiping path, often spiraling or revisiting ' +
          'already-cleaned regions.',
        videos: [
          { label: 'Good force, wrong path',    file: 'fail_01.mp4' },
          { label: 'Repeated coverage',         file: 'fail_02.mp4' },
          { label: 'Early termination',         file: 'fail_03.mp4' },
        ],
      },
      naive_multimodal: {
        description:
          '<strong>Naive Multimodal</strong> fusion over a fixed horizon creates ' +
          'reward conflicts — the tactile signal dominates when out of contact, ' +
          'disrupting visual path planning.',
        videos: [
          { label: 'Reward conflict / jitter',   file: 'fail_01.mp4' },
          { label: 'Tactile override of path',   file: 'fail_02.mp4' },
          { label: 'Oscillation at contact zone', file: 'fail_03.mp4' },
        ],
      },
    },

    insertion: {
      base_policy: {
        description:
          '<strong>Base Policy</strong> struggles to align the peg with the hole, ' +
          'frequently missing by a few millimeters or applying lateral force that ' +
          'prevents insertion.',
        videos: [
          { label: 'Misaligned approach',   file: 'fail_01.mp4' },
          { label: 'Lateral force jam',     file: 'fail_02.mp4' },
          { label: 'Peg slip on rim',       file: 'fail_03.mp4' },
        ],
      },
      visual_steering: {
        description:
          '<strong>Visual Steering</strong> guides the peg to approximately the ' +
          'right position but cannot sense fine alignment errors from RGB, ' +
          'leading to edge-contact failures.',
        videos: [
          { label: 'Visually aligned, edge contact', file: 'fail_01.mp4' },
          { label: 'Small offset causes jam',         file: 'fail_02.mp4' },
          { label: 'Cannot detect rim contact',       file: 'fail_03.mp4' },
        ],
      },
      tactile_steering: {
        description:
          '<strong>Tactile Steering</strong> refines contact forces once near the ' +
          'hole but without global visual guidance, it cannot consistently locate ' +
          'the hole entrance.',
        videos: [
          { label: 'Good contact, wrong hole',  file: 'fail_01.mp4' },
          { label: 'Searches without convergence', file: 'fail_02.mp4' },
          { label: 'Force refinement in wrong loc', file: 'fail_03.mp4' },
        ],
      },
      naive_multimodal: {
        description:
          '<strong>Naive Multimodal</strong> fusion conflicts when visual and ' +
          'tactile signals disagree on the insertion phase, causing the robot to ' +
          'abort early or over-correct.',
        videos: [
          { label: 'Early abort on conflict', file: 'fail_01.mp4' },
          { label: 'Over-correction loop',    file: 'fail_02.mp4' },
          { label: 'Mixed-signal stall',      file: 'fail_03.mp4' },
        ],
      },
    },
  };

  /* ─── DOM ─── */
  const taskSel     = document.getElementById('fm-task');
  const baselineSel = document.getElementById('fm-baseline');
  const content     = document.getElementById('fm-content');

  /* ─── Render ─── */
  function render() {
    const task     = taskSel.value;
    const baseline = baselineSel.value;
    const entry    = (FM_DATA[task] || {})[baseline];

    if (!entry) {
      content.innerHTML =
        `<div class="fm-empty">No data for this combination yet.<br>` +
        `Add videos to <code>static/videos/failure/${task}/${baseline}/</code></div>`;
      return;
    }

    const videoDir = `static/videos/failure/${task}/${baseline}`;

    const videoCells = entry.videos.map(({ label, file }) => {
      const src = `${videoDir}/${file}`;
      return `
        <div class="fm-video-cell">
          <video muted loop playsinline>
            <source src="${src}" type="video/mp4"/>
          </video>
          <span class="fm-video-label">${label}</span>
        </div>`;
    }).join('');

    content.innerHTML = `
      <div class="fm-description">${entry.description}</div>
      <div class="fm-video-grid">${videoCells}</div>`;

    /* autoplay newly inserted videos that are in view */
    content.querySelectorAll('video').forEach(v => {
      v.load();
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
          entries.forEach(e => e.isIntersecting ? v.play().catch(() => {}) : v.pause());
        }, { threshold: 0.3 }).observe(v);
      }
    });
  }

  taskSel.addEventListener('change', render);
  baselineSel.addEventListener('change', render);

  /* ─── Boot ─── */
  render();
})();
