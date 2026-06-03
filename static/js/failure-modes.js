(function () {
  'use strict';

  const BASE = 'static/videos/failure_modes';

  const FM_DATA = {
    pipette: {
      taskDir: 'liquid_exps',
      baselines: {
        base_policy: {
          videos: [
            { reason: 'Insufficient Force to Grasp',       instruction: 'Transfer to yellow cup', instrClass: 'yellow-instr', folder: 'insufficient_force_to_grasp' },
            { reason: 'Spill with Too Large Force',         instruction: 'Transfer to yellow cup', instrClass: 'yellow-instr', folder: 'spill_with_too_large_force' },
            { reason: 'Wrong Cup Selected',                 instruction: 'Transfer to blue cup',   instrClass: 'blue-instr',   folder: 'wrong_cup_selected' },
          ],
        },
        visual_baseline: {
          videos: [
            { reason: 'Drop the Dropper (Too Small Force)', instruction: 'Transfer to blue cup',   instrClass: 'blue-instr',   folder: 'drop_the_dropper_too_small_force' },
            { reason: 'Fail to Put Back',                   instruction: 'Transfer to blue cup',   instrClass: 'blue-instr',   folder: 'fail_to_put_back' },
            { reason: 'Spill with Too Large Force',         instruction: 'Transfer to blue cup',   instrClass: 'blue-instr',   folder: 'spill_with_too_large_force' },
          ],
        },
        tactile_baseline: {
          videos: [
            { reason: 'Select the Wrong Cup',               instruction: 'Transfer to yellow cup', instrClass: 'yellow-instr', folder: 'select_the_wrong_cup' },
            { reason: 'Stuck at the Cup, Fail to Put Back', instruction: 'Transfer to yellow cup', instrClass: 'yellow-instr', folder: 'stuck_at_the_cup_fail_to_put_back' },
          ],
        },
        naive_combination: {
          videos: [
            { reason: 'Fail to Put It Back',                instruction: 'Transfer to blue cup',   instrClass: 'blue-instr',   folder: 'fail_to_put_it_back' },
            { reason: 'Spill on the Way (Too Large Force)', instruction: 'Transfer to yellow cup', instrClass: 'yellow-instr', folder: 'spill_on_the_way_due_to_too_large_force' },
          ],
        },
      },
    },
    wiping: {
      taskDir: 'wipe_exps',
      baselines: {
        base_policy: {
          videos: [
            { reason: 'Too Large Force (stuck)', instruction: 'Wipe black marks',  instrClass: 'black-instr',  folder: 'too_large_force' },
            { reason: 'Wipe Not Clean',          instruction: 'Wipe black marks',  instrClass: 'black-instr',  folder: 'wipe_not_clean' },
            { reason: 'Wipe Wrong Marks',        instruction: 'Wipe black marks',  instrClass: 'black-instr',  folder: 'wipe_wrong_marks' },
          ],
        },
        visual_baseline: {
          videos: [
            { reason: 'Wipe Not Clean',          instruction: 'Wipe orange marks', instrClass: 'orange-instr', folder: 'wipe_not_clean' },
          ],
        },
        tactile_baseline: {
          videos: [
            { reason: 'Too Large Force (stuck)', instruction: 'Wipe orange marks', instrClass: 'orange-instr', folder: 'too_large_force' },
            { reason: 'Wipe Wrong Marks',        instruction: 'Wipe black marks',  instrClass: 'black-instr',  folder: 'wrong_marks' },
          ],
        },
        naive_combination: {
          videos: [
            { reason: 'Wipe Not Clean (Black)',  instruction: 'Wipe black marks',  instrClass: 'black-instr',  folder: 'wipe_not_clean_black' },
            { reason: 'Wipe Not Clean (Orange)', instruction: 'Wipe orange marks', instrClass: 'orange-instr', folder: 'wipe_not_clean_orange' },
          ],
        },
      },
    },
    insertion: {
      taskDir: 'insert_exps',
      baselines: {
        base_policy: {
          videos: [
            { reason: 'Fail to Grasp',       instruction: 'Insert into top-left hole',  instrClass: 'blue-instr',   folder: 'fail_to_grasp' },
            { reason: 'Fail to Insert',      instruction: 'Insert into top-left hole',  instrClass: 'blue-instr',   folder: 'fail_to_insert' },
            { reason: 'Wrong Hole Selected', instruction: 'Insert into top-left hole', instrClass: 'blue-instr', folder: 'wrong_cup_selected' },
          ],
        },
        visual_baseline: {
          videos: [
            { reason: 'Fail to Grasp',       instruction: 'Insert into top-left hole',  instrClass: 'blue-instr',   folder: 'fail_to_grasp' },
            { reason: 'Fail to Insert',      instruction: 'Insert into top-left hole',  instrClass: 'blue-instr',   folder: 'fail_to_insert' },
          ],
        },
        tactile_baseline: {
          videos: [
            { reason: 'Wrong Hole to Insert', instruction: 'Insert into top-left hole', instrClass: 'blue-instr',   folder: 'wrong_hole_to_insert' },
          ],
        },
        naive_combination: {
          videos: [
            { reason: 'Fail to Insert (Left Hole)',  instruction: 'Insert into top-left hole',  instrClass: 'blue-instr',   folder: 'fail_to_insert_left' },
            { reason: 'Fail to Insert (Right Hole)', instruction: 'Insert into top-right hole', instrClass: 'yellow-instr', folder: 'fail_to_insert_right' },
          ],
        },
      },
    },
  };

  /* ─── DOM ─── */
  const taskSel     = document.getElementById('fm-task');
  const baselineSel = document.getElementById('fm-baseline');
  const content     = document.getElementById('fm-content');
  if (!taskSel || !baselineSel || !content) return;

  /* ─── Lightbox ─────────────────────────────────────────────────────── */
  function openLightbox(card) {
    const lb = document.getElementById('trial-lightbox');
    if (!lb) return;

    const lbTitle  = lb.querySelector('.lb-title');
    const lbBadge  = lb.querySelector('.lb-badge');
    const lbVideos = lb.querySelector('.lb-videos');

    lbTitle.textContent = card.querySelector('.fm-reason').textContent;

    const instrEl = card.querySelector('.fm-instruction');
    lbBadge.textContent = instrEl.textContent;
    let lbClass = 'lb-blue';
    if (instrEl.classList.contains('yellow-instr')) lbClass = 'lb-yellow';
    else if (instrEl.classList.contains('orange-instr')) lbClass = 'lb-orange';
    else if (instrEl.classList.contains('black-instr')) lbClass = 'lb-black';
    lbBadge.className = 'lb-badge ' + lbClass;

    lbVideos.innerHTML = '';
    card.querySelectorAll('video').forEach(src => {
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

  /* ─── Render ─────────────────────────────────────────────────────── */
  function render() {
    const task     = taskSel.value;
    const baseline = baselineSel.value;
    const taskData = FM_DATA[task];
    const entry    = taskData && taskData.baselines[baseline];

    content.querySelectorAll('video').forEach(v => v.pause());

    if (!entry || !entry.videos || entry.videos.length === 0) {
      content.innerHTML = '<div class="fm-empty">Videos for this combination are coming soon.</div>';
      return;
    }

    const cards = entry.videos.map(({ reason, instruction, instrClass, folder }) => {
      const dir = `${BASE}/${taskData.taskDir}/${baseline}/${folder}`;
      return `
        <div class="fm-real-card">
          <div class="fm-card-meta">
            <span class="fm-reason">${reason}</span>
            <span class="fm-instruction ${instrClass}">${instruction}</span>
          </div>
          <div class="trial-dual-videos">
            <video muted loop playsinline>
              <source src="${dir}/camera_0.mp4" type="video/mp4"/>
            </video>
            <video muted loop playsinline>
              <source src="${dir}/camera_2.mp4" type="video/mp4"/>
            </video>
          </div>
        </div>`;
    }).join('');

    content.innerHTML = `<div class="fm-real-grid">${cards}</div>`;

    /* Playback rate, autoplay, dblclick lightbox */
    content.querySelectorAll('.fm-real-card').forEach(card => {
      card.querySelectorAll('video').forEach(v => {
        v.defaultPlaybackRate = 2;
        v.playbackRate = 2;
        v.load();
        if ('IntersectionObserver' in window) {
          new IntersectionObserver(entries => {
            entries.forEach(e => e.isIntersecting ? v.play().catch(() => {}) : v.pause());
          }, { threshold: 0.3 }).observe(v);
        }
      });

      card.addEventListener('dblclick', () => openLightbox(card));
    });
  }

  taskSel.addEventListener('change', render);
  baselineSel.addEventListener('change', render);
  render();
})();
