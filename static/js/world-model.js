(function () {
  'use strict';

  const BASE = 'static/videos/world_model';

  // Populate episode lists when videos are available.
  // Each entry is a filename stem (e.g. 'episode_00') under
  // static/videos/world_model/{task}/{outcome}/{stem}.mp4
  const WM_DATA = {
    pipette: {
      success: [
        { stem: 'transfer_yellow_success', label: 'Successfully transfer liquid to the yellow cup and return' },
        { stem: 'transfer_blue_success',   label: 'Successfully transfer liquid to the blue cup and return'   },
      ],
      failure: [
        { stem: 'yellow_spill_middle', label: 'Transfer to the yellow cup but spill in the middle and near the cup' },
        { stem: 'yellow_fail_putback', label: 'Transfer to the yellow cup but fail to put the dropper back'    },
        { stem: 'blue_fail_putback',   label: 'Transfer to the blue cup but fail to put the dropper back'      },
        { stem: 'blue_spill_outside',  label: 'Transfer to the blue cup but spill outside the cup'             },
      ],
    },
    wiping: {
      success: [
        { stem: 'black_mark_success',   label: 'Successfully wipe the black marks'  },
        { stem: 'orange_mark_success',  label: 'Successfully wipe the orange marks' },
      ],
      failure: [
        { stem: 'too_large_force_stuck', label: 'Too large force (stuck)' },
        { stem: 'wipe_orange_not_clean', label: 'Partially wipe the orange marks' },
        { stem: 'wipe_black_not_clean',  label: 'Partially wipe the black marks' },
      ],
    },
    insertion: {
      success: [
        { stem: 'insert_top_left',       label: 'Successfully insert the purple peg into the top-left hole'  },
        { stem: 'insert_top_right',      label: 'Successfully insert the purple peg into the top-right hole' },
      ],
      failure: [
        { stem: 'grasp_failure',         label: 'Grasp failure' },
        { stem: 'fail_insert_top_left',  label: 'Fail to insert the purple peg into the top-left hole'  },
        { stem: 'fail_insert_top_right', label: 'Fail to insert the purple peg into the top-right hole' },
      ],
    },
  };

  const COL_LABELS = ['Front Camera', 'Wrist Camera', 'Tactile Camera'];
  const ROW_LABELS = ['GT', 'Pred', 'Diff'];

  const taskSel    = document.getElementById('wm-task');
  const outcomeSel = document.getElementById('wm-outcome');
  const content    = document.getElementById('wm-content');
  if (!taskSel || !outcomeSel || !content) return;

  function render() {
    const task     = taskSel.value;
    const outcome  = outcomeSel.value;
    const episodes = WM_DATA[task][outcome];

    content.querySelectorAll('video').forEach(v => v.pause());

    if (!episodes || episodes.length === 0) {
      content.innerHTML = '<div class="fm-empty">Videos for this combination are coming soon.</div>';
      return;
    }

    const colHead = COL_LABELS.map(l => `<span class="wm-col-label">${l}</span>`).join('');
    const rowHead = ROW_LABELS.map(l => `<span class="wm-row-label">${l}</span>`).join('');

    const cards = episodes.map(item => {
      const stem  = typeof item === 'string' ? item : item.stem;
      const label = typeof item === 'string' ? '' : (item.label || '');
      const src   = `${BASE}/${task}/${outcome}/${stem}.mp4`;
      const titleHtml = label ? `<div class="wm-card-title">${label}</div>` : '';
      return `
        <div class="wm-card">
          ${titleHtml}
          <div class="wm-header-row">
            <div class="wm-row-gutter"></div>
            <div class="wm-col-headers">${colHead}</div>
          </div>
          <div class="wm-body-row">
            <div class="wm-row-labels">${rowHead}</div>
            <div class="wm-video-wrap">
              <video muted loop playsinline>
                <source src="${src}" type="video/mp4"/>
              </video>
            </div>
          </div>
        </div>`;
    }).join('');

    content.innerHTML = `<div class="wm-grid">${cards}</div>`;

    function enterFullscreen(el, video) {
      // Prefer fullscreening the card (so labels stay visible). On iOS Safari,
      // only the <video> element supports webkitEnterFullscreen, so fall back.
      const tryReq = (target) => {
        const fn = target.requestFullscreen
                || target.webkitRequestFullscreen
                || target.mozRequestFullScreen
                || target.msRequestFullscreen
                || target.webkitEnterFullscreen;
        if (!fn) return false;
        try {
          const result = fn.call(target);
          if (result && typeof result.catch === 'function') result.catch(() => {});
          return true;
        } catch (_) { return false; }
      };
      if (!tryReq(el)) tryReq(video);
    }

    content.querySelectorAll('.wm-card').forEach(card => {
      const video = card.querySelector('video');
      if (!video) return;
      video.defaultPlaybackRate = 2;
      video.playbackRate = 2;
      video.load();
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
          entries.forEach(e => e.isIntersecting ? video.play().catch(() => {}) : video.pause());
        }, { threshold: 0.3 }).observe(video);
      }
      card.addEventListener('dblclick', () => enterFullscreen(card, video));
    });
  }

  taskSel.addEventListener('change', render);
  outcomeSel.addEventListener('change', render);
  render();
})();
