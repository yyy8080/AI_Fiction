/* 《回滚人生》章节复制工具 —— 纯静态，无后端依赖 */
(function () {
  'use strict';

  var DATA_DIR = 'data/';
  var STORE_CHAPTER = 'rollback-life:last-chapter';
  var STORE_FONT = 'rollback-life:font-size';
  var FONT_STEPS = [15, 17, 19, 21];

  var manifest = null;
  var chapterIndex = {};      // id -> 目录条目
  var partCache = {};         // part 下标 -> Promise<{id: chapter}>
  var itemNodes = {};         // id -> 目录 DOM
  var current = null;         // 当前章节完整数据
  var toastTimer = null;

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    list: $('chapterList'), search: $('search'), searchMeta: $('searchMeta'),
    reader: $('reader'), pager: $('pager'), prev: $('prevBtn'), next: $('nextBtn'),
    sidebar: $('sidebar'), scrim: $('scrim'), menu: $('menuBtn'), toast: $('toast'),
    total: $('totalStat'), fontBtn: $('fontBtn'),
    exportBtn: $('exportBtn'), panel: $('exportPanel'), from: $('exportFrom'),
    to: $('exportTo'), withTitle: $('exportWithTitle'), exportMeta: $('exportMeta')
  };

  /* ---------------- 数据加载 ---------------- */

  function loadJSON(file) {
    return fetch(DATA_DIR + file, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(file + ' 载入失败（HTTP ' + res.status + '）');
      return res.json();
    });
  }

  function loadPart(index) {
    if (!partCache[index]) {
      partCache[index] = loadJSON(manifest.parts[index].file).then(function (part) {
        var map = {};
        part.chapters.forEach(function (ch) { map[ch.id] = ch; });
        return map;
      }).catch(function (err) {
        delete partCache[index];
        throw err;
      });
    }
    return partCache[index];
  }

  function getChapter(id) {
    var meta = chapterIndex[id];
    if (!meta) return Promise.reject(new Error('没有第' + id + '章'));
    return loadPart(meta.part).then(function (map) {
      var ch = map[id];
      if (!ch) throw new Error('第' + id + '章数据缺失');
      return ch;
    });
  }

  /* ---------------- 目录 ---------------- */

  function buildList() {
    var frag = document.createDocumentFragment();
    var volumes = manifest.volumes && manifest.volumes.length
      ? manifest.volumes
      : [{ name: '全部章节', from: 1, to: manifest.count }];

    volumes.forEach(function (vol) {
      var chapters = manifest.chapters.filter(function (c) { return c.id >= vol.from && c.id <= vol.to; });
      if (!chapters.length) return;

      var head = document.createElement('div');
      head.className = 'vol-head';
      head.dataset.volume = vol.name;
      head.textContent = vol.name + '（第' + vol.from + '–' + vol.to + '章）';
      frag.appendChild(head);

      chapters.forEach(function (c) {
        var btn = document.createElement('button');
        btn.className = 'chapter-item';
        btn.type = 'button';
        btn.dataset.id = c.id;
        btn.dataset.search = c.id + ' ' + c.title.toLowerCase();

        var num = document.createElement('span');
        num.className = 'num';
        num.textContent = c.id;
        var name = document.createElement('span');
        name.className = 'name';
        name.textContent = c.name || c.title;

        btn.appendChild(num);
        btn.appendChild(name);
        frag.appendChild(btn);
        itemNodes[c.id] = btn;
      });
    });

    els.list.appendChild(frag);
  }

  function filterList(query) {
    var q = query.trim().toLowerCase();
    var shown = 0;

    manifest.chapters.forEach(function (c) {
      var node = itemNodes[c.id];
      var hit = !q || node.dataset.search.indexOf(q) !== -1;
      node.classList.toggle('hidden', !hit);
      if (hit) shown += 1;
    });

    // 整卷无命中时隐藏卷标题
    Array.prototype.forEach.call(els.list.querySelectorAll('.vol-head'), function (head) {
      var node = head.nextElementSibling;
      var any = false;
      while (node && node.classList.contains('chapter-item')) {
        if (!node.classList.contains('hidden')) { any = true; break; }
        node = node.nextElementSibling;
      }
      head.classList.toggle('hidden', !any);
    });

    els.searchMeta.textContent = q
      ? '命中 ' + shown + ' 章'
      : '共 ' + manifest.count + ' 章 · 点击跳转';
  }

  function markActive(id) {
    Array.prototype.forEach.call(els.list.querySelectorAll('.chapter-item.active'), function (n) {
      n.classList.remove('active');
    });
    var node = itemNodes[id];
    if (!node) return;
    node.classList.add('active');
    var box = els.list.getBoundingClientRect();
    var rect = node.getBoundingClientRect();
    if (rect.top < box.top || rect.bottom > box.bottom) {
      node.scrollIntoView({ block: 'center' });
    }
  }

  /* ---------------- 渲染 ---------------- */

  function renderChapter(ch) {
    current = ch;
    var meta = chapterIndex[ch.id];

    var inner = document.createElement('div');
    inner.className = 'reader-inner';

    var line = document.createElement('p');
    line.className = 'chapter-meta';
    line.textContent = (meta.volume ? meta.volume + ' · ' : '') +
      '第 ' + ch.id + ' / ' + manifest.count + ' 章 · 约 ' + meta.chars + ' 字';
    inner.appendChild(line);

    var h1 = document.createElement('h1');
    h1.className = 'chapter-title';
    h1.textContent = ch.title;
    inner.appendChild(h1);

    if (ch.note) {
      var note = document.createElement('div');
      note.className = 'chapter-note';
      note.textContent = ch.note + '\n（编者按，不含在复制内容中）';
      inner.appendChild(note);
    }

    var body = document.createElement('div');
    body.className = 'chapter-body';
    ch.body.split(/\n{2,}/).forEach(function (para) {
      para.split('\n').forEach(function (linetext) {
        if (!linetext.trim()) return;
        var p = document.createElement('p');
        p.textContent = linetext;
        body.appendChild(p);
      });
    });
    inner.appendChild(body);

    els.reader.innerHTML = '';
    els.reader.appendChild(inner);
    els.reader.scrollTop = 0;

    els.pager.hidden = false;
    els.prev.disabled = !chapterIndex[ch.id - 1];
    els.next.disabled = !chapterIndex[ch.id + 1];
    document.title = ch.title + ' · 回滚人生';
    markActive(ch.id);
    try { localStorage.setItem(STORE_CHAPTER, String(ch.id)); } catch (e) { /* 隐私模式 */ }
  }

  function openChapter(id, options) {
    var opts = options || {};
    if (!chapterIndex[id]) return;
    if (opts.updateHash !== false) {
      var hash = '#/ch/' + id;
      if (location.hash !== hash) {
        history.replaceState(null, '', hash);
      }
    }
    els.reader.innerHTML = '<p class="loading">载入中…</p>';
    getChapter(id).then(renderChapter).catch(function (err) {
      els.reader.innerHTML = '<p class="error">' + err.message + '</p>';
    });
  }

  /* ---------------- 复制 ---------------- */

  function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('浏览器拒绝了复制，请长按手动选择'));
    });
  }

  function toast(message, isError) {
    els.toast.textContent = message;
    els.toast.classList.toggle('error', !!isError);
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 1900);
  }

  function flashButton(btn) {
    if (!btn) return;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = '已复制 ✓';
    btn.classList.add('done');
    clearTimeout(btn._timer);
    btn._timer = setTimeout(function () {
      btn.textContent = btn.dataset.label;
      btn.classList.remove('done');
    }, 1600);
  }

  function copy(text, label, btn) {
    if (!text) { toast('没有可复制的内容', true); return; }
    writeClipboard(text).then(function () {
      flashButton(btn);
      toast('已复制' + label + '（' + text.length + ' 字符）');
    }).catch(function (err) {
      toast(err.message || '复制失败', true);
    });
  }

  function copyKind(kind, btn) {
    if (!current) { toast('还没有打开章节', true); return; }
    if (kind === 'title') copy(current.title, '标题', btn);
    else if (kind === 'body') copy(current.body, '正文', btn);
    else copy(current.title + '\n\n' + current.body, '标题+正文', btn);
  }

  /* ---------------- 批量导出 ---------------- */

  function rangeText(from, to, withTitle) {
    var ids = [];
    for (var id = from; id <= to; id += 1) if (chapterIndex[id]) ids.push(id);
    var needed = {};
    ids.forEach(function (id) { needed[chapterIndex[id].part] = true; });

    return Promise.all(Object.keys(needed).map(function (p) { return loadPart(Number(p)); }))
      .then(function (maps) {
        var all = {};
        maps.forEach(function (m) { Object.keys(m).forEach(function (k) { all[k] = m[k]; }); });
        return ids.map(function (id) {
          var ch = all[id];
          return withTitle ? ch.title + '\n\n' + ch.body : ch.body;
        }).join('\n\n\n');
      });
  }

  function readRange() {
    var from = Math.max(1, parseInt(els.from.value, 10) || 1);
    var to = Math.min(manifest.count, parseInt(els.to.value, 10) || from);
    if (to < from) to = from;
    return { from: from, to: to };
  }

  function updateExportMeta() {
    var r = readRange();
    var chars = 0;
    for (var id = r.from; id <= r.to; id += 1) {
      if (chapterIndex[id]) chars += chapterIndex[id].chars;
    }
    els.exportMeta.textContent = '第' + r.from + '–' + r.to + '章，共 ' +
      (r.to - r.from + 1) + ' 章、约 ' + chars.toLocaleString('zh-CN') + ' 字';
  }

  function openExport() {
    var base = current ? current.id : 1;
    els.from.value = base;
    els.to.value = Math.min(manifest.count, base + 9);
    els.from.max = manifest.count;
    els.to.max = manifest.count;
    updateExportMeta();
    els.panel.hidden = false;
  }

  function download(name, text) {
    var blob = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------- 界面杂项 ---------------- */

  function setSidebar(open) {
    els.sidebar.classList.toggle('open', open);
    els.scrim.hidden = !open;
    els.menu.setAttribute('aria-expanded', String(open));
  }

  function isMobile() { return window.matchMedia('(max-width: 760px)').matches; }

  function applyFont(size) {
    document.documentElement.style.setProperty('--reader-size', size + 'px');
    try { localStorage.setItem(STORE_FONT, String(size)); } catch (e) { /* 隐私模式 */ }
  }

  function cycleFont() {
    var currentSize = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--reader-size'), 10) || FONT_STEPS[1];
    var idx = FONT_STEPS.indexOf(currentSize);
    var next = FONT_STEPS[(idx + 1) % FONT_STEPS.length];
    applyFont(next);
    toast('正文字号 ' + next + 'px');
  }

  function idFromLocation() {
    var m = /(?:#\/ch\/|[?&]ch=)(\d+)/.exec(location.hash + location.search);
    return m ? Number(m[1]) : 0;
  }

  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
      btn.addEventListener('click', function () { copyKind(btn.dataset.copy, btn); });
    });

    els.list.addEventListener('click', function (e) {
      var item = e.target.closest('.chapter-item');
      if (!item) return;
      openChapter(Number(item.dataset.id));
      if (isMobile()) setSidebar(false);
    });

    els.search.addEventListener('input', function () { filterList(els.search.value); });
    els.search.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var first = els.list.querySelector('.chapter-item:not(.hidden)');
      if (first) {
        openChapter(Number(first.dataset.id));
        if (isMobile()) setSidebar(false);
      }
    });

    els.prev.addEventListener('click', function () { if (current) openChapter(current.id - 1); });
    els.next.addEventListener('click', function () { if (current) openChapter(current.id + 1); });

    els.menu.addEventListener('click', function () { setSidebar(!els.sidebar.classList.contains('open')); });
    els.scrim.addEventListener('click', function () { setSidebar(false); });
    els.fontBtn.addEventListener('click', cycleFont);

    els.exportBtn.addEventListener('click', openExport);
    $('exportCancel').addEventListener('click', function () { els.panel.hidden = true; });
    els.panel.addEventListener('click', function (e) { if (e.target === els.panel) els.panel.hidden = true; });
    els.from.addEventListener('input', updateExportMeta);
    els.to.addEventListener('input', updateExportMeta);

    $('exportCopy').addEventListener('click', function (e) {
      var r = readRange();
      rangeText(r.from, r.to, els.withTitle.checked).then(function (text) {
        copy(text, '第' + r.from + '–' + r.to + '章', e.currentTarget);
      });
    });

    $('exportDownload').addEventListener('click', function () {
      var r = readRange();
      rangeText(r.from, r.to, els.withTitle.checked).then(function (text) {
        download('回滚人生-第' + r.from + '-' + r.to + '章.txt', text);
        toast('已下载 第' + r.from + '–' + r.to + '章.txt');
      });
    });

    window.addEventListener('hashchange', function () {
      var id = idFromLocation();
      if (id && (!current || id !== current.id)) openChapter(id, { updateHash: false });
    });

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

      if (e.key === 'Escape') {
        els.panel.hidden = true;
        setSidebar(false);
        if (typing) e.target.blur();
        return;
      }
      if (typing) return;

      if (e.key === 'ArrowLeft' && current && chapterIndex[current.id - 1]) {
        openChapter(current.id - 1);
      } else if (e.key === 'ArrowRight' && current && chapterIndex[current.id + 1]) {
        openChapter(current.id + 1);
      } else if (e.key === 'c' || e.key === 'C') {
        if (window.getSelection && String(window.getSelection())) return; // 让用户自己选中的文本正常复制
        copyKind('both', document.querySelector('[data-copy="both"]'));
      } else if (e.key === '/') {
        e.preventDefault();
        if (isMobile()) setSidebar(true);
        els.search.focus();
      }
    });
  }

  /* ---------------- 启动 ---------------- */

  function start() {
    try {
      var saved = parseInt(localStorage.getItem(STORE_FONT), 10);
      if (FONT_STEPS.indexOf(saved) !== -1) applyFont(saved);
    } catch (e) { /* 隐私模式 */ }

    loadJSON('chapters.json').then(function (data) {
      manifest = data;
      manifest.chapters.forEach(function (c) { chapterIndex[c.id] = c; });

      els.total.textContent = '共 ' + manifest.count + ' 章 · ' +
        Math.round(manifest.chars / 10000) + ' 万字';
      buildList();
      filterList('');
      bind();

      var last = 0;
      try { last = parseInt(localStorage.getItem(STORE_CHAPTER), 10) || 0; } catch (e) { /* 隐私模式 */ }
      var id = idFromLocation() || last || manifest.chapters[0].id;
      if (!chapterIndex[id]) id = manifest.chapters[0].id;
      openChapter(id);
    }).catch(function (err) {
      els.reader.innerHTML = '<p class="error">' + err.message +
        '<br>请先运行 <code>node build.mjs</code> 生成 data/，并通过 HTTP 服务器打开本页面。</p>';
    });
  }

  start();
})();
