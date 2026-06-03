/* ── Task tabs for 20-trial grid ── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const task = btn.dataset.task;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.trial-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`trials-${task}`).classList.add('active');
    observeVideos();
  });
});

/* ── Success / fail borders ─────────────────────────────────────────────────
 * Successful episodes (0-indexed): 0,3,4,5,6,8,9,11,12,14,16,17,18,19
 * trial N in HTML = episode N-1
 * ─────────────────────────────────────────────────────────────────────────── */
const SUCCESS_EPISODES = {
  pipette:   new Set([0,3,4,5,6,8,9,11,12,14,16,17,18,19]),
  insertion: new Set([0,2,4,5,6,8,11,12,14,15,16,17,18,19]),
  wiping:    new Set([6,8,9,3,5,10,11,12,13,14,2,1,0,17,18,19]),
};

/* pipette & insertion: episode = trial - 1 (sequential order)
   wiping: episode stored explicitly in data-episode attribute */
['pipette', 'insertion'].forEach(task => {
  document.querySelectorAll(`#trials-${task} .trial-cell[data-trial]`).forEach(cell => {
    const episode = parseInt(cell.dataset.trial, 10) - 1;
    cell.classList.add(SUCCESS_EPISODES[task].has(episode) ? 'trial-success' : 'trial-fail');
  });
});

document.querySelectorAll('#trials-wiping .trial-cell[data-episode]').forEach(cell => {
  const episode = parseInt(cell.dataset.episode, 10);
  cell.classList.add(SUCCESS_EPISODES.wiping.has(episode) ? 'trial-success' : 'trial-fail');
});

/* ── Lightbox ────────────────────────────────────────────────────────────── */
(function () {
  /* Build the DOM once */
  const lb = document.createElement('div');
  lb.id = 'trial-lightbox';
  lb.innerHTML = `
    <div class="lb-backdrop"></div>
    <div class="lb-inner">
      <div class="lb-header">
        <span class="lb-title"></span>
        <div style="display:flex;align-items:center;gap:0.6rem">
          <span class="lb-badge"></span>
          <button class="lb-close" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="lb-videos"></div>
    </div>`;
  document.body.appendChild(lb);

  const lbTitle  = lb.querySelector('.lb-title');
  const lbBadge  = lb.querySelector('.lb-badge');
  const lbVideos = lb.querySelector('.lb-videos');

  function open(cell) {
    const trialNum = cell.dataset.trial;
    const isSuccess = cell.classList.contains('trial-success');

    lbTitle.textContent = `Trial ${trialNum}`;
    lbBadge.textContent = isSuccess ? 'Success' : 'Fail';
    lbBadge.className   = 'lb-badge ' + (isSuccess ? 'success' : 'fail');

    /* Clone sources into fresh <video> elements */
    lbVideos.innerHTML = '';
    cell.querySelectorAll('video').forEach(src => {
      const v = document.createElement('video');
      v.muted = true;
      v.loop  = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('controls', '');
      src.querySelectorAll('source').forEach(s => {
        const ns = document.createElement('source');
        ns.src  = s.src;
        ns.type = s.type;
        v.appendChild(ns);
      });
      lbVideos.appendChild(v);
      v.load();
      v.defaultPlaybackRate = 2;
      v.playbackRate = 2;
      v.play().catch(() => {});
    });

    lb.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lb.classList.remove('active');
    lbVideos.querySelectorAll('video').forEach(v => v.pause());
    document.body.style.overflow = '';
  }

  lb.querySelector('.lb-backdrop').addEventListener('click', close);
  lb.querySelector('.lb-close').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  /* Attach dblclick to all trial cells (current and future tab switches) */
  function attachDblclick() {
    document.querySelectorAll('.trial-cell').forEach(cell => {
      if (cell.dataset.lbBound) return;
      cell.dataset.lbBound = '1';
      cell.addEventListener('dblclick', () => open(cell));
    });
  }
  attachDblclick();

  /* Re-attach when tabs switch (wiping / insertion panels) */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', attachDblclick);
  });
})();

/* ── 2× playback rate on all videos ── */
function applyPlaybackRate(root, rate) {
  (root || document).querySelectorAll('video').forEach(v => {
    v.defaultPlaybackRate = rate;
    v.playbackRate = rate;
    v.addEventListener('loadedmetadata', () => { v.playbackRate = rate; }, { once: false });
  });
}
applyPlaybackRate(document, 2);

/* ── Autoplay muted videos when in viewport ── */
function observeVideos() {
  if (!('IntersectionObserver' in window)) return;
  document.querySelectorAll('video[muted]').forEach(v => {
    new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { v.play().catch(() => {}); }
        else { v.pause(); }
      });
    }, { threshold: 0.3 }).observe(v);
  });
}

observeVideos();

/* ── Hide teaser placeholder once video loads ── */
const teaserVideo = document.querySelector('#teaser video');
const teaserPH    = document.getElementById('teaser-placeholder');
if (teaserVideo && teaserPH) {
  teaserVideo.addEventListener('loadeddata', () => { teaserPH.style.display = 'none'; });
}
