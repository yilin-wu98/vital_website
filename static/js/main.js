/* ── Task tabs for 20-trial grid ── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const task = btn.dataset.task;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.trial-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`trials-${task}`).classList.add('active');
    // kick off autoplay for newly visible videos
    observeVideos();
  });
});

/* ── Autoplay muted videos when in viewport ── */
function observeVideos() {
  if (!('IntersectionObserver' in window)) return;
  document.querySelectorAll('video[muted]').forEach(v => {
    new IntersectionObserver((entries, obs) => {
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
