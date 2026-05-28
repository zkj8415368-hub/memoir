
(function () {
  var $ = function (id) { return document.getElementById(id); };

  var categories = [], memories = [];
  var hero = { name: '我的回忆录', subtitle: '记录每一个瞬间', videoSrc: '' };
  var bgmSrc = '', lbIdx = -1;
  var shIdx = 0, shOrder = [];

  /* ===== IndexedDB ===== */
  function idb() {
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open('memwall-v8-db', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }
  function idbGet(k) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readonly');
        var r = tx.objectStore('kv').get(k);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function idbSet(k, v) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(v, k);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function save() { idbSet('data', { categories: categories, memories: memories, hero: hero, bgmSrc: bgmSrc }).catch(function () {}); }

  async function load() {
    try {
      // Migrate from localStorage first
      for (var i = 8; i >= 3; i--) {
        var keys = ['memwall-v' + i, 'memory-wall-v' + i, 'memwall-v' + i + '-db'];
        for (var k = 0; k < keys.length; k++) {
          var raw = localStorage.getItem(keys[k]);
          if (raw) { var d = JSON.parse(raw); categories = d.categories || []; memories = d.memories || []; hero = d.hero || d.heroSettings || hero; bgmSrc = d.bgmSrc || ''; save(); return; }
        }
      }
      // Load from IndexedDB (old db name)
      var d = await idbGet('data');
      if (d) { categories = d.categories || []; memories = d.memories || []; hero = d.hero || hero; bgmSrc = d.bgmSrc || ''; }
    } catch (e) {}
  }

  /* ===== Helpers ===== */
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function memsByCat(id) { return memories.filter(function (m) { return m.categoryId === id; }); }
  function pickFile(accept, cb) {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.multiple = true;
    inp.onchange = function () {
      for (var i = 0; i < inp.files.length; i++) {
        (function (f) { var r = new FileReader(); r.onload = function (e) { cb(e.target.result, f.type.startsWith('video/') ? 'video' : 'image'); }; r.readAsDataURL(f); })(inp.files[i]);
      }
    };
    inp.click();
  }

  /* ===== Tilt ===== */
  function initTilt(el) {
    var inner = el.querySelector('.card-inner'), glare = el.querySelector('.glare');
    el.addEventListener('mousemove', function (e) {
      var r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      var px = (x / r.width - 0.5) * 2, py = (y / r.height - 0.5) * 2;
      var rx = -py * 14, ry = px * 14;
      inner.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateZ(20px)';
      el.style.transform = 'scale(1.06)';
      el.style.boxShadow = (ry * 1.2) + 'px ' + (rx * -1) + 'px 30px rgba(0,0,0,0.5), 0 0 30px rgba(99,102,241,' + (0.15 + Math.abs(px) * 0.15) + ')';
      if (glare) { glare.style.setProperty('--mx', x + 'px'); glare.style.setProperty('--my', y + 'px'); glare.style.opacity = '1'; }
    });
    el.addEventListener('mouseleave', function () {
      inner.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0px)';
      el.style.transform = 'scale(1)';
      el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      if (glare) glare.style.opacity = '0';
    });
  }

  /* ===== Render ===== */
  function renderStrips() {
    var s = $('strips-container');
    if (!categories.length) {
      s.innerHTML = '<div style="text-align:center;padding:60px;color:#444;"><p style="font-size:15px;margin-bottom:8px;">还没有片段<span class="en">No strips yet</span></p><p style="font-size:13px;color:#555;">点击新建片段或直接拖放照片到页面<span class="en">Click "+" or drag files here</span></p></div>';
      return;
    }

    s.innerHTML = categories.map(function (cat) {
      var mems = memsByCat(cat.id), has = mems.length > 0;
      return '<div class="strip-group" data-cat-id="' + cat.id + '" draggable="true">' +
        '<div class="strip-group-header">' +
          '<span class="drag-handle">⋮⋮</span>' +
          '<div class="strip-group-title">' + esc(cat.name) + ' <span class="count">' + mems.length + ' photos</span></div>' +
          '<div class="strip-group-actions">' +
            '<button class="rename-cat" data-cat-id="' + cat.id + '">重命名<span class="en-inline">Rename</span></button>' +
            '<button class="delete-cat" data-cat-id="' + cat.id + '" style="color:#ef4444">删除<span class="en-inline">Delete</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="strip-wrapper" data-cat-id="' + cat.id + '">' +
          '<div class="strip-container" data-cat-id="' + cat.id + '">' +
            '<div class="strip-track">' +
            (has
              ? mems.map(function (m) {
                  var idx = memories.indexOf(m);
                  return '<div class="strip-card" data-index="' + idx + '" data-cat-id="' + cat.id + '" draggable="true">' +
                    '<div class="card-inner">' +
                      (m.type === 'video'
                        ? '<video src="' + m.src + '" muted loop playsinline preload="metadata"></video><div class="video-badge"></div>'
                        : '<img src="' + m.src + '" alt="" loading="lazy">') +
                      '<div class="card-overlay">' + (m.desc ? '<div class="card-desc">' + esc(m.desc) + '</div>' : '') + '</div>' +
                      '<div class="glare"></div>' +
                      '<div class="shine"></div>' +
                    '</div>' +
                    '<button class="delete-card-btn" data-action="delete-card" data-index="' + idx + '">×</button>' +
                  '</div>';
                }).join('')
              : '<div class="strip-empty"><p>暂无照片<span class="en">No photos yet</span></p><p class="sub">拖放文件到此处即可添加<span class="en">Drag files here</span></p></div>'
            ) +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    // Mouse-follow + auto scroll
    s.querySelectorAll('.strip-wrapper').forEach(function (w) {
      var c = w.querySelector('.strip-container'), t = c.querySelector('.strip-track');
      var curX = 0, targetX = 0, mouseIn = false, speed = -0.8;

      function maxS() { return Math.max(0, t.scrollWidth - w.clientWidth + 60); }

      function tick() {
        var m = maxS();
        if (m <= 0) { requestAnimationFrame(tick); return; }
        if (!mouseIn) { targetX += speed; if (targetX <= -m || targetX >= 0) speed = -speed; }
        var d = targetX - curX;
        if (Math.abs(d) > 0.1) curX += d * 0.1; else curX = targetX;
        t.style.transform = 'translateX(' + Math.round(curX) + 'px)';
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);

      w.addEventListener('mouseenter', function () {
        mouseIn = true; t.style.transition = 'none';
        activeStrip = { track: t, getMax: maxS, scrollBy: function (d) {
          var m = maxS(); if (m <= 0) return;
          t.style.transition = 'transform 0.45s cubic-bezier(0.25, 0.8, 0.25, 1)';
          targetX = Math.max(-m, Math.min(0, curX + d)); curX = targetX;
          t.style.transform = 'translateX(' + Math.round(curX) + 'px)';
          clearTimeout(t._tt); t._tt = setTimeout(function () { t.style.transition = 'none'; }, 500);
        }}});
      w.addEventListener('mousemove', function (e) {
        var m = maxS(); if (m <= 0) return;
        t.style.transition = 'none';
        targetX = -Math.max(0, Math.min(1, (e.clientX - w.getBoundingClientRect().left) / w.clientWidth)) * m;
      });
      w.addEventListener('mouseleave', function () { mouseIn = false; if (activeStrip && activeStrip.track === t) activeStrip = null; });
    });

    // Tilt + hover video
    s.querySelectorAll('.strip-card').forEach(function (c) {
      initTilt(c);
      var v = c.querySelector('video');
      if (v) { c.addEventListener('mouseenter', function () { v.play().catch(function () {}); }); c.addEventListener('mouseleave', function () { v.pause(); v.currentTime = 0; }); }
    });
  }

  function addMemory(src, type, catId) {
    catId = catId || (categories.length > 0 ? categories[categories.length - 1].id : null);
    if (!catId) { catId = Date.now().toString(); categories.push({ id: catId, name: '新建片段' }); }
    memories.unshift({ id: Date.now(), src: src, type: type, desc: '', categoryId: catId, date: Date.now() });
    save(); renderStrips();
  }

  /* ===== Drag & Drop files ===== */
  var $dragOverlay = $('drag-overlay');
  document.addEventListener('dragover', function (e) { e.preventDefault(); $dragOverlay.classList.add('active'); });
  document.addEventListener('dragleave', function (e) {
    e.preventDefault();
    if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight) $dragOverlay.classList.remove('active');
  });
  document.addEventListener('drop', function (e) {
    e.preventDefault(); $dragOverlay.classList.remove('active');
    if (!e.dataTransfer.files.length) return;
    for (var i = 0; i < e.dataTransfer.files.length; i++) {
      (function (f) { var r = new FileReader(); r.onload = function (ev) { addMemory(ev.target.result, f.type.startsWith('video/') ? 'video' : 'image'); }; r.readAsDataURL(f); })(e.dataTransfer.files[i]);
    }
  });

  /* ===== Drag to reorder ===== */
  var dragSrcIdx = -1, dragCatId = null, groupDragId = null, activeStrip = null;
  var stripsEl = $('strips-container');

  stripsEl.addEventListener('dragstart', function (e) {
    if (!e.target.closest('.strip-card') && !e.target.closest('button')) {
      var grp = e.target.closest('.strip-group');
      if (grp) { groupDragId = grp.dataset.catId; grp.classList.add('drag-ghost'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); return; }
    }
    var card = e.target.closest('.strip-card');
    if (!card) return;
    dragSrcIdx = Number(card.dataset.index); dragCatId = card.dataset.catId;
    card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', '');
  });

  function clearGDrag() {
    stripsEl.querySelectorAll('.drag-ghost').forEach(function (g) { g.classList.remove('drag-ghost'); });
    stripsEl.querySelectorAll('.drag-target-above, .drag-target-below').forEach(function (g) { g.classList.remove('drag-target-above', 'drag-target-below'); });
    groupDragId = null;
  }

  stripsEl.addEventListener('dragend', function () {
    var c = document.querySelector('.strip-card.dragging'); if (c) c.classList.remove('dragging');
    stripsEl.querySelectorAll('.strip-card.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
    dragSrcIdx = -1; dragCatId = null; clearGDrag();
  });

  stripsEl.addEventListener('dragover', function (e) {
    e.preventDefault();
    if (groupDragId) {
      var grp = e.target.closest('.strip-group');
      if (grp && grp.dataset.catId !== groupDragId) {
        e.dataTransfer.dropEffect = 'move';
        stripsEl.querySelectorAll('.drag-target-above, .drag-target-below').forEach(function (g) { g.classList.remove('drag-target-above', 'drag-target-below'); });
        grp.classList.add(e.clientY < grp.getBoundingClientRect().top + grp.getBoundingClientRect().height / 2 ? 'drag-target-above' : 'drag-target-below');
      }
      return;
    }
    var card = e.target.closest('.strip-card');
    if (!card || card.dataset.catId !== dragCatId) return;
    e.dataTransfer.dropEffect = 'move';
    stripsEl.querySelectorAll('.strip-card.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
    card.classList.add('drag-over');
  });

  stripsEl.addEventListener('drop', function (e) {
    e.preventDefault();
    if (groupDragId) {
      var grp = e.target.closest('.strip-group');
      if (grp && grp.dataset.catId !== groupDragId) {
        var si = categories.findIndex(function (c) { return c.id === groupDragId; });
        var di = categories.findIndex(function (c) { return c.id === grp.dataset.catId; });
        if (si >= 0 && di >= 0) {
          var ins = e.clientY < grp.getBoundingClientRect().top + grp.getBoundingClientRect().height / 2 ? di : di + 1;
          if (si < ins) ins--;
          categories.splice(ins, 0, categories.splice(si, 1)[0]); save(); renderStrips();
        }
      }
      clearGDrag(); return;
    }
    var card = e.target.closest('.strip-card');
    if (!card || card.dataset.catId !== dragCatId || dragSrcIdx < 0) return;
    card.classList.remove('drag-over');
    var di = Number(card.dataset.index); if (di === dragSrcIdx) return;
    var item = memories.splice(dragSrcIdx, 1)[0];
    if (dragSrcIdx < di) di--;
    memories.splice(di, 0, item); save(); renderStrips();
  });

  /* ===== Right-click move ===== */
  var ctxIdx = -1, $ctxMenu = $('ctx-menu'), $ctxCatList = $('ctx-cat-list');
  function hideCtx() { $ctxMenu.classList.remove('show'); ctxIdx = -1; }

  stripsEl.addEventListener('contextmenu', function (e) {
    var card = e.target.closest('.strip-card'); if (!card) return;
    e.preventDefault(); ctxIdx = Number(card.dataset.index);
    var curCatId = memories[ctxIdx].categoryId;
    $ctxCatList.innerHTML = categories.filter(function (c) { return c.id !== curCatId; }).map(function (c) {
      return '<button data-cat-id="' + c.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' + esc(c.name) + '</button>';
    }).join('');
    $ctxMenu.style.left = e.clientX + 'px'; $ctxMenu.style.top = e.clientY + 'px';
    var mr = $ctxMenu.getBoundingClientRect();
    if (mr.right > innerWidth) $ctxMenu.style.left = (e.clientX - mr.width) + 'px';
    if (mr.bottom > innerHeight) $ctxMenu.style.top = (e.clientY - mr.height) + 'px';
    $ctxMenu.classList.add('show');
  });
  $ctxMenu.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (btn && ctxIdx >= 0) { memories[ctxIdx].categoryId = btn.dataset.catId; save(); renderStrips(); }
    hideCtx();
  });
  document.addEventListener('click', function (e) { if (!$ctxMenu.contains(e.target)) hideCtx(); });

  /* ===== Strips click events ===== */
  stripsEl.addEventListener('click', function (e) {
    var card = e.target.closest('.strip-card');
    if (card) {
      if (e.target.dataset.action === 'delete-card') { e.stopPropagation(); if (confirm('Delete this photo? · 确定删除？')) { memories.splice(Number(e.target.dataset.index), 1); save(); renderStrips(); } return; }
      if (e.target.closest('.video-badge')) return;
      openLB(Number(card.dataset.index)); return;
    }
    if (e.target.classList.contains('delete-cat')) {
      var cid = e.target.dataset.catId;
      if (confirm('Delete this strip? Photos will not be deleted. · 删除这个片段？照片不会被删除。')) { categories = categories.filter(function (c) { return c.id !== cid; }); memories.forEach(function (m) { if (m.categoryId === cid) m.categoryId = null; }); save(); renderStrips(); }
    }
    if (e.target.classList.contains('rename-cat')) {
      var cat = categories.find(function (c) { return c.id === e.target.dataset.catId; });
      if (cat) { var nn = prompt('新名称 New name：', cat.name); if (nn && nn.trim()) { cat.name = nn.trim(); save(); renderStrips(); } }
    }
  });

  /* ===== Toolbar ===== */
  $('btn-new-strip').addEventListener('click', function () { var n = prompt('片段名称 Strip name：', '新片段'); if (n && n.trim()) { categories.push({ id: Date.now().toString(), name: n.trim() }); save(); renderStrips(); } });
  $('btn-add-photos').addEventListener('click', function () { pickFile('image/*,video/*', function (s, t) { addMemory(s, t); }); });

  /* ===== Hero ===== */
  function applyHero() {
    $('hero-name-text').textContent = hero.name || '我的回忆录';
    $('hero-sub-text').textContent = hero.subtitle || '记录每一个瞬间';
    if (hero.videoSrc) { var v = $('hero-video'); v.src = hero.videoSrc; v.style.display = 'block'; $('hero').classList.add('has-video'); v.play().catch(function () {}); }
    else { $('hero-video').style.display = 'none'; $('hero').classList.remove('has-video'); }
  }
  $('hero-name-wrap').addEventListener('click', function () { var n = prompt('名字 Name：', hero.name); if (n && n.trim()) { hero.name = n.trim(); save(); applyHero(); } });
  $('hero-sub-wrap').addEventListener('click', function () { var s = prompt('副标题 Subtitle：', hero.subtitle); if (s && s.trim()) { hero.subtitle = s.trim(); save(); applyHero(); } });
  $('hero-set-video').addEventListener('click', function (e) { e.stopPropagation(); pickFile('video/*', function (s) { hero.videoSrc = s; save(); applyHero(); }); });
  $('hero-video').addEventListener('dblclick', function (e) { e.stopPropagation(); if (confirm('Remove background video? · 移除背景视频？')) { hero.videoSrc = ''; save(); applyHero(); } });

  /* ===== BGM ===== */
  var bgmPlaying = false, bgmAudioCtx = null, bgmGain = null;

  // Built-in ambient music generator
  function createAmbient() {
    if (bgmAudioCtx) return;
    bgmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    bgmAudioCtx.resume();
    bgmGain = bgmAudioCtx.createGain();
    bgmGain.gain.value = 0.2;
    bgmGain.connect(bgmAudioCtx.destination);

    // Pentatonic melody like a music box
    var melody = [
      523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 440.00,
      493.88, 523.25, 587.33, 523.25, 493.88, 440.00, 392.00, 349.23,
      392.00, 440.00, 523.25, 440.00, 392.00, 349.23, 329.63, 293.66,
      329.63, 392.00, 349.23, 329.63, 293.66, 261.63, 293.66, 329.63
    ];
    var noteLen = 0.5;

    function playNote(i) {
      if (!bgmAudioCtx || bgmAudioCtx.state === 'closed') { bgmPlaying = false; return; }
      var now = bgmAudioCtx.currentTime;
      var freq = melody[i % melody.length];

      var osc = bgmAudioCtx.createOscillator();
      var g = bgmAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.25, now + 0.03);
      g.gain.linearRampToValueAtTime(0.1, now + noteLen * 0.4);
      g.gain.exponentialRampToValueAtTime(0.001, now + noteLen * 0.85);
      osc.connect(g); g.connect(bgmGain);
      osc.start(now); osc.stop(now + noteLen);

      // Soft overtone
      var o2 = bgmAudioCtx.createOscillator();
      var g2 = bgmAudioCtx.createGain();
      o2.type = 'sine'; o2.frequency.value = freq * 1.5;
      g2.gain.setValueAtTime(0, now);
      g2.gain.linearRampToValueAtTime(0.05, now + 0.04);
      g2.gain.exponentialRampToValueAtTime(0.001, now + noteLen * 0.6);
      o2.connect(g2); g2.connect(bgmGain);
      o2.start(now); o2.stop(now + noteLen * 0.7);

      bgmAudioCtx._bgmTimer = setTimeout(function () { playNote((i + 1) % melody.length); }, noteLen * 1000);
    }

    playNote(0);
  }

  function destroyAmbient() {
    if (bgmAudioCtx) {
      clearTimeout(bgmAudioCtx._bgmTimer);
      bgmAudioCtx.close();
      bgmAudioCtx = null;
      bgmGain = null;
    }
  }

  function updateMusicUI() {
    var b = $('music-btn'), i = $('music-icon');
    if (bgmPlaying) { b.classList.add('playing'); i.textContent = '♫'; }
    else { b.classList.remove('playing'); i.textContent = bgmSrc ? '♫' : '♫'; }
    b.style.color = '#a78bfa';
  }

  function toggleBgm() {
    if (bgmPlaying) {
      if (bgmSrc) { $('bgm-audio').pause(); } else { destroyAmbient(); }
      bgmPlaying = false;
      updateMusicUI();
    } else {
      bgmPlaying = true; // Must set before createAmbient which checks this
      if (bgmSrc) {
        var a = $('bgm-audio'); a.src = bgmSrc; a.crossOrigin = 'anonymous';
        a.play().catch(function () { bgmPlaying = false; updateMusicUI(); });
      } else {
        if (!bgmAudioCtx) createAmbient();
        else { bgmAudioCtx.resume().catch(function () { bgmPlaying = false; }); }
      }
      updateMusicUI();
    }
  }

  function pickBgm() {
    var url = prompt('粘贴音乐链接（或点取消上传文件）\nPaste audio URL or cancel to upload file:');
    if (url && url.trim()) {
      destroyAmbient();
      bgmSrc = url.trim(); save();
      var a = $('bgm-audio'); a.src = bgmSrc; a.crossOrigin = 'anonymous';
      a.play().then(function () { bgmPlaying = true; updateMusicUI(); }).catch(function () { bgmPlaying = false; updateMusicUI(); });
      updateMusicUI();
    } else {
      pickFile('audio/*', function (s) {
        destroyAmbient();
        bgmSrc = s; save();
        var a = $('bgm-audio'); a.src = s;
        a.play().then(function () { bgmPlaying = true; updateMusicUI(); }).catch(function () { bgmPlaying = false; updateMusicUI(); });
        updateMusicUI();
      });
    }
  }

  $('music-btn').addEventListener('click', toggleBgm);
  $('music-btn').addEventListener('contextmenu', function (e) { e.preventDefault(); if (bgmSrc) { destroyAmbient(); bgmSrc = ''; save(); } pickBgm(); });
  $('bgm-audio').addEventListener('pause', function () { bgmPlaying = false; updateMusicUI(); });
  $('bgm-audio').addEventListener('play', function () { bgmPlaying = true; updateMusicUI(); });

  /* ===== Lightbox ===== */
  function openLB(i) { lbIdx = i; updateLB(); $('lightbox').classList.add('active'); document.body.style.overflow = 'hidden'; }
  function closeLB() { $('lightbox').classList.remove('active'); document.body.style.overflow = ''; lbIdx = -1; $('lb-media-container').innerHTML = ''; }
  function updateLB() { var m = memories[lbIdx]; $('lb-desc').textContent = m.desc || ''; $('lb-media-container').innerHTML = m.type === 'video' ? '<video src="' + m.src + '" controls autoplay style="max-width:90vw;max-height:85vh;border-radius:12px;"></video>' : '<img src="' + m.src + '" style="max-width:90vw;max-height:85vh;border-radius:12px;">'; }
  function navLB(d) { if (!memories.length) return; lbIdx = (lbIdx + d + memories.length) % memories.length; updateLB(); }
  $('lightbox').addEventListener('click', function (e) { if (e.target === $('lightbox')) closeLB(); });
  $('lb-close').addEventListener('click', closeLB);
  $('lb-prev').addEventListener('click', function () { navLB(-1); });
  $('lb-next').addEventListener('click', function () { navLB(1); });

  /* ===== Shuffle ===== */
  function openShuffle() {
    if (!memories.length) return;
    shOrder = memories.map(function (_, i) { return i; });
    for (var i = shOrder.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = shOrder[i]; shOrder[i] = shOrder[j]; shOrder[j] = t; }
    shIdx = 0; $('shuffle-overlay').classList.add('active'); document.body.style.overflow = 'hidden'; renderShCard();
  }
  function closeShuffle() { $('shuffle-overlay').classList.remove('active'); document.body.style.overflow = ''; $('shuffle-area').innerHTML = ''; }
  function renderShCard() {
    var m = memories[shOrder[shIdx]], a = $('shuffle-area');
    $('shuffle-counter').textContent = (shIdx + 1) + ' / ' + shOrder.length;
    var c = document.createElement('div'); c.className = 'shuffle-card';
    c.innerHTML = (m.type === 'video' ? '<video src="' + m.src + '" controls playsinline></video>' : '<img src="' + m.src + '" draggable="false">') + (m.desc ? '<div class="shuffle-caption">' + esc(m.desc) + '</div>' : '');
    var sx = 0, sy = 0;
    c.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    c.addEventListener('touchend', function (e) { var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) swipeSh(dx < 0 ? 'left' : 'right'); });
    a.innerHTML = ''; a.appendChild(c);
  }
  function swipeSh(dir) {
    var c = $('shuffle-area').querySelector('.shuffle-card'); if (!c) return;
    c.classList.add(dir === 'left' ? 'swiping-left' : 'swiping-right');
    setTimeout(function () { shIdx = dir === 'left' ? (shIdx + 1) % shOrder.length : (shIdx - 1 + shOrder.length) % shOrder.length; renderShCard(); }, 400);
  }
  $('shuffle-prev').addEventListener('click', function () { swipeSh('right'); });
  $('shuffle-next').addEventListener('click', function () { swipeSh('left'); });
  $('shuffle-close').addEventListener('click', closeShuffle);
  $('btn-shuffle').addEventListener('click', openShuffle);

  /* ===== Keyboard ===== */
  document.addEventListener('keydown', function (e) {
    if ($('shuffle-overlay').classList.contains('active')) { if (e.key === 'Escape') closeShuffle(); else if (e.key === 'ArrowLeft') swipeSh('right'); else if (e.key === 'ArrowRight') swipeSh('left'); return; }
    if ($('lightbox').classList.contains('active')) { if (e.key === 'Escape') closeLB(); else if (e.key === 'ArrowLeft') navLB(-1); else if (e.key === 'ArrowRight') navLB(1); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && activeStrip) {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (!document.contains(activeStrip.track)) { activeStrip = null; return; }
      e.preventDefault(); activeStrip.scrollBy(e.key === 'ArrowRight' ? -174 : 174);
    }
  });

  /* ===== Fade ===== */
  var fadeObs = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visible'); fadeObs.unobserve(e.target); } }); }, { threshold: 0.1 });

  /* ===== Init ===== */
  // Auto-translate category names
  function autoTranslateCatNames() {
    var map = {
      '旅行': '旅行 Travel', '美食': '美食 Food', '日常': '日常 Daily',
      '朋友': '朋友 Friends', '工作': '工作 Work', '家庭': '家庭 Family',
      '宠物': '宠物 Pets', '音乐': '音乐 Music', '运动': '运动 Sports',
      '游戏': '游戏 Gaming', '学习': '学习 Study', '风景': '风景 Scenery',
      '生日': '生日 Birthday', '节日': '节日 Holiday', '回忆': '回忆 Memories',
      '毕业': '毕业 Graduation', '海边': '海边 Seaside', '城市': '城市 City',
      '新建片段': '新建片段 New Strip', '新片段': '新片段 New Strip'
    };
    var changed = false;
    categories.forEach(function (c) {
      if (map[c.name]) { c.name = map[c.name]; changed = true; }
      else if (!/[a-zA-Z]/.test(c.name)) { c.name = c.name + ' Strip'; changed = true; }
    });
    if (changed) save();
  }

  async function init() {
    await load();
    autoTranslateCatNames();
    applyHero(); renderStrips();
    if (bgmSrc) { var a = $('bgm-audio'); a.src = bgmSrc; a.crossOrigin = 'anonymous'; }
    updateMusicUI();
    document.querySelectorAll('.fade-in').forEach(function (e) { fadeObs.observe(e); });
  }
  init();
})();
