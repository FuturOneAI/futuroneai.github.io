/* FuturOne — Live Demo playback engine
 * Replays recorded agent runs (see demo-scenarios.js) in the browser.
 * Plain JS, no dependencies. Honors prefers-reduced-motion (no typewriter).
 *
 * XSS note: the only user-controlled input on this page is the parameter
 * field. It is length-limited, stripped of markup characters in
 * sanitizeParam(), and additionally HTML-escaped via esc() at every
 * injection point. All other markup originates from our own static
 * scenario data in demo-scenarios.js.
 */
(function () {
  'use strict';

  var SCN = window.DEMO_SCENARIOS || {};
  var ORDER = ['code-review', 'due-diligence', 'contract-review', 'market-research'];
  var REDUCED = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TYPE_CPS = 110; // typewriter chars/sec at 1x

  /* ---------- element handles ---------- */
  function $(id) { return document.getElementById(id); }
  var els = {
    scnGrid: $('scnGrid'),
    consoleName: $('consoleName'),
    recordedNote: $('recordedNote'),
    statusPill: $('statusPill'),
    runBtn: $('runBtn'),
    speedGroup: $('speedGroup'),
    elapsed: $('elapsed'),
    progressFill: $('progressFill'),
    paramLabel: $('paramLabel'),
    paramInput: $('paramInput'),
    paramHint: $('paramHint'),
    briefText: $('briefText'),
    planList: $('planList'),
    planEmpty: $('planEmpty'),
    findingsTally: $('findingsTally'),
    feedScroll: $('feedScroll'),
    feed: $('feed'),
    resumeBtn: $('resumeBtn'),
    artTabs: $('artTabs'),
    artDeliverable: $('artDeliverable'),
    artTrace: $('artTrace'),
    artCost: $('artCost'),
    artStatus: $('artStatus'),
    liveStatus: $('liveStatus')
  };
  if (!els.scnGrid || !els.feed) return; // not on the demo page

  /* ---------- state ---------- */
  var state = {
    key: null,
    sc: null,
    param: '',
    speed: 1,
    running: false,
    done: false,
    idx: 0,
    vClock: 0,
    total: 0,
    cum: [],
    stepIndex: {},     // step id -> {n, label}
    openCalls: {},     // tool_call id -> block refs
    tally: { critical: 0, warning: 0, info: 0, pass: 0 },
    typers: [],
    autoScroll: true,
    progScroll: false,
    lastTick: 0,
    tracePre: null
  };

  /* ---------- utilities ---------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function sanitizeParam(v) {
    return String(v || '')
      .replace(/[<>&"'`\\]/g, '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim().slice(0, 60);
  }
  function interp(s) { // plain-text contexts (textContent)
    return String(s).split('{{param}}').join(state.param);
  }
  function interpHTML(s) { // HTML contexts — param is escaped
    return String(s).split('{{param}}').join(esc(state.param));
  }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function fmtClock(ms) {
    var t = Math.max(0, Math.round(ms / 100)); // tenths
    var m = Math.floor(t / 600), s = Math.floor((t % 600) / 10), d = t % 10;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + '.' + d;
  }

  /* JSON pretty-printer with token coloring; interpolates {{param}} in strings */
  function jsonHTML(v, ind) {
    ind = ind || '';
    var pad = ind + '  ';
    if (v === null) return '<span class="j-b">null</span>';
    if (typeof v === 'number') return '<span class="j-n">' + v + '</span>';
    if (typeof v === 'boolean') return '<span class="j-b">' + v + '</span>';
    if (typeof v === 'string') return '<span class="j-s">"' + esc(interp(v)) + '"</span>';
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      var items = v.map(function (x) { return pad + jsonHTML(x, pad); });
      return '[\n' + items.join(',\n') + '\n' + ind + ']';
    }
    var keys = Object.keys(v);
    if (!keys.length) return '{}';
    var rows = keys.map(function (k) {
      return pad + '<span class="j-k">"' + esc(k) + '"</span>: ' + jsonHTML(v[k], pad);
    });
    return '{\n' + rows.join(',\n') + '\n' + ind + '}';
  }

  /* ---------- typewriter ---------- */
  function typeInto(node, text) {
    var full = interp(text);
    if (REDUCED) { node.textContent = full; scrollFeed(); return; }
    node.classList.add('typing');
    state.typers.push({ node: node, text: full, pos: 0 });
  }
  function pumpTypers(dt) {
    if (!state.typers.length) return;
    var chars = Math.max(1, Math.round(TYPE_CPS * state.speed * dt / 1000));
    for (var i = state.typers.length - 1; i >= 0; i--) {
      var ty = state.typers[i];
      ty.pos = Math.min(ty.text.length, ty.pos + chars);
      ty.node.textContent = ty.text.slice(0, ty.pos);
      if (ty.pos >= ty.text.length) {
        ty.node.classList.remove('typing');
        state.typers.splice(i, 1);
      }
    }
    scrollFeed();
  }
  function flushTypers() {
    state.typers.forEach(function (ty) {
      ty.node.textContent = ty.text;
      ty.node.classList.remove('typing');
    });
    state.typers = [];
  }

  /* ---------- feed scrolling ---------- */
  function scrollFeed() {
    if (!state.autoScroll) return;
    state.progScroll = true;
    els.feedScroll.scrollTop = els.feedScroll.scrollHeight;
    window.requestAnimationFrame(function () { state.progScroll = false; });
  }
  els.feedScroll.addEventListener('scroll', function () {
    if (state.progScroll) return;
    var gap = els.feedScroll.scrollHeight - els.feedScroll.scrollTop -
      els.feedScroll.clientHeight;
    var nearBottom = gap < 60;
    state.autoScroll = nearBottom;
    els.resumeBtn.hidden = !(state.running && !nearBottom);
  });
  els.resumeBtn.addEventListener('click', function () {
    state.autoScroll = true;
    els.resumeBtn.hidden = true;
    scrollFeed();
  });

  /* ---------- trace ---------- */
  function traceLine(ms, kind, text) {
    if (!state.tracePre) {
      els.artTrace.innerHTML = '';
      state.tracePre = el('pre', 'trace-pre');
      els.artTrace.appendChild(state.tracePre);
    }
    var k = (kind + '              ').slice(0, 14);
    var line = el('code', 'tl', '<i>' + fmtClock(ms) + '</i>  ' + esc(k) + ' ' + esc(interp(text)));
    state.tracePre.appendChild(line);
  }

  /* ---------- plan panel ---------- */
  function buildPlan(steps) {
    els.planEmpty.hidden = true;
    els.planList.innerHTML = '';
    state.stepIndex = {};
    steps.forEach(function (s, i) {
      state.stepIndex[s.id] = { n: i + 1, label: s.label };
      var li = el('li', 'plan-step pending');
      li.id = 'ps-' + s.id;
      li.innerHTML = '<span class="ps-ic" aria-hidden="true"></span>' +
        '<span class="ps-label">' + esc(s.label) + '</span>' +
        '<span class="ps-chip"></span>';
      els.planList.appendChild(li);
    });
  }
  function planState(stepId, cls, chip) {
    var li = $('ps-' + stepId);
    if (!li) return;
    li.className = 'plan-step ' + cls;
    if (chip !== undefined) li.querySelector('.ps-chip').textContent = chip;
  }

  /* ---------- findings tally ---------- */
  function bumpTally(sev) {
    state.tally[sev] = (state.tally[sev] || 0) + 1;
    renderTally();
  }
  function renderTally() {
    var t = state.tally, parts = [];
    if (t.critical) parts.push('<span class="sev crit">' + t.critical + ' critical</span>');
    if (t.warning) parts.push('<span class="sev warn">' + t.warning + ' warning</span>');
    if (t.info) parts.push('<span class="sev info">' + t.info + ' info</span>');
    if (t.pass) parts.push('<span class="sev pass">' + t.pass + ' pass</span>');
    els.findingsTally.innerHTML = parts.length
      ? parts.join(' ')
      : '<span class="tally-none">No findings yet</span>';
  }

  /* ---------- event renderers ---------- */
  function fire(e, at) {
    switch (e.t) {
      case 'status': {
        var line = el('div', 'fl fl-status');
        line.innerHTML = '<span class="fl-prefix" aria-hidden="true">&#9656;</span><span class="fl-text"></span>';
        els.feed.appendChild(line);
        typeInto(line.querySelector('.fl-text'), e.text);
        traceLine(at, 'status', e.text);
        break;
      }
      case 'plan': {
        buildPlan(e.steps);
        var pl = el('div', 'fl fl-plan',
          '<span class="fl-prefix" aria-hidden="true">&#9656;</span>Plan created — ' +
          e.steps.length + ' steps. Executing.');
        els.feed.appendChild(pl);
        traceLine(at, 'plan', e.steps.length + ' steps');
        break;
      }
      case 'step_start': {
        var info = state.stepIndex[e.step] || { n: '?', label: e.step };
        planState(e.step, 'active');
        var dv = el('div', 'fl fl-step',
          '<span class="fl-stepno">STEP ' + info.n + '/' +
          Object.keys(state.stepIndex).length + '</span>' + esc(info.label));
        els.feed.appendChild(dv);
        traceLine(at, 'step_start', info.label);
        break;
      }
      case 'tool_call': {
        var block = el('div', 'tool-block running');
        var head = el('button', 'tool-head');
        head.type = 'button';
        head.setAttribute('aria-expanded', 'true');
        head.innerHTML = '<span class="tb-chev" aria-hidden="true">&#9662;</span>' +
          '<span class="tb-name">' + esc(e.tool) + '</span>' +
          '<span class="tb-state"><span class="tb-spin" aria-hidden="true"></span>running</span>';
        var body = el('div', 'tool-body');
        body.innerHTML = '<div class="tb-lbl">args</div>' +
          '<pre class="tb-json">' + jsonHTML(e.args) + '</pre>';
        block.appendChild(head); block.appendChild(body);
        var ref = { block: block, head: head, body: body, userToggled: false, open: true };
        head.addEventListener('click', function () {
          ref.userToggled = true;
          ref.open = !ref.open;
          block.classList.toggle('collapsed', !ref.open);
          head.setAttribute('aria-expanded', ref.open ? 'true' : 'false');
        });
        state.openCalls[e.id] = ref;
        els.feed.appendChild(block);
        traceLine(at, 'tool_call', e.tool);
        break;
      }
      case 'tool_result': {
        var rf = state.openCalls[e.call];
        if (rf) {
          rf.block.classList.remove('running');
          rf.head.querySelector('.tb-state').innerHTML =
            '<span class="tb-lat">' + esc(e.latency) + '</span>';
          rf.body.insertAdjacentHTML('beforeend',
            '<div class="tb-lbl">result</div>' +
            '<pre class="tb-json">' + jsonHTML(e.result) + '</pre>');
          // auto-collapse a beat after the result lands, unless the user took over
          (function (r) {
            window.setTimeout(function () {
              if (r.userToggled || !state.running) return;
              r.open = false;
              r.block.classList.add('collapsed');
              r.head.setAttribute('aria-expanded', 'false');
              scrollFeed();
            }, 1600 / state.speed);
          })(rf);
        }
        traceLine(at, 'tool_result', e.latency);
        break;
      }
      case 'finding': {
        var sevCls = { critical: 'crit', warning: 'warn', info: 'info', pass: 'pass' }[e.severity] || 'info';
        var label = e.sevLabel || e.severity;
        var f = el('div', 'finding ' + sevCls);
        f.innerHTML = '<div class="f-head"><span class="sev ' + sevCls + '">' +
          esc(label) + '</span><strong>' + esc(interp(e.title)) + '</strong></div>' +
          '<p class="f-detail"></p>';
        els.feed.appendChild(f);
        typeInto(f.querySelector('.f-detail'), e.detail);
        bumpTally(e.severity);
        traceLine(at, 'finding:' + label, e.title);
        break;
      }
      case 'step_done': {
        planState(e.step, 'done', e.took);
        traceLine(at, 'step_done',
          (state.stepIndex[e.step] ? state.stepIndex[e.step].label : e.step) +
          ' (' + e.took + ')');
        break;
      }
      case 'artifact': {
        renderArtifact();
        var al = el('div', 'fl fl-artifact',
          '<span class="fl-prefix" aria-hidden="true">&#10003;</span>' +
          esc(e.label) + ' — deliverable, trace, and cost attribution are in the artifact panel.');
        els.feed.appendChild(al);
        traceLine(at, 'artifact', e.label);
        break;
      }
      case 'run_done': {
        var rd = el('div', 'fl fl-done',
          '<span class="fl-prefix" aria-hidden="true">&#9632;</span>Run complete — ' +
          esc(interp(e.summary)));
        els.feed.appendChild(rd);
        traceLine(at, 'run_done', e.summary);
        finishRun();
        break;
      }
    }
    scrollFeed();
  }

  /* ---------- artifact panel ---------- */
  function renderArtifact() {
    els.artDeliverable.innerHTML = interpHTML(state.sc.artifact);
    var c = state.sc.cost;
    var html = '<div class="art-scroll"><table class="art-table cost-table"><thead><tr>' +
      '<th>Step</th><th>Model</th><th>Tokens in</th><th>Tokens out</th><th>Latency</th><th>Cost</th>' +
      '</tr></thead><tbody>';
    c.rows.forEach(function (r) {
      html += '<tr>' + r.map(function (cell, i) {
        return '<td' + (i >= 2 ? ' class="num"' : '') + '>' + esc(cell) + '</td>';
      }).join('') + '</tr>';
    });
    html += '<tr class="cost-total">' + c.total.map(function (cell, i) {
      return '<td' + (i >= 2 ? ' class="num"' : '') + '>' + esc(cell) + '</td>';
    }).join('') + '</tr>';
    html += '</tbody></table></div>' +
      '<p class="art-foot">Latency shown is original-run wall clock per step. ' +
      'Model routing is decided per step by the orchestrator — see ' +
      '<a href="/how-it-works.html">how it works</a> for the policy.</p>';
    els.artCost.innerHTML = html;
    els.artStatus.textContent = 'ready';
    els.artStatus.className = 'art-ready';
    showTab('deliverable');
  }
  function resetArtifact() {
    els.artDeliverable.innerHTML =
      '<div class="art-empty">The deliverable appears here when the run completes.</div>';
    els.artTrace.innerHTML =
      '<div class="art-empty">A flat, timestamped event log fills in as the run executes.</div>';
    els.artCost.innerHTML =
      '<div class="art-empty">Per-step model, token, and cost attribution appears when the run completes.</div>';
    els.artStatus.textContent = 'waiting for run';
    els.artStatus.className = '';
    state.tracePre = null;
    showTab('deliverable');
  }
  function showTab(name) {
    var btns = els.artTabs.querySelectorAll('button[data-tab]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], on = b.getAttribute('data-tab') === name;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    els.artDeliverable.hidden = name !== 'deliverable';
    els.artTrace.hidden = name !== 'trace';
    els.artCost.hidden = name !== 'cost';
  }
  els.artTabs.addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('button[data-tab]') : null;
    if (b) showTab(b.getAttribute('data-tab'));
  });

  /* ---------- run lifecycle ---------- */
  function resetRun() {
    state.running = false;
    state.done = false;
    state.idx = 0;
    state.vClock = 0;
    state.typers = [];
    state.openCalls = {};
    state.tally = { critical: 0, warning: 0, info: 0, pass: 0 };
    state.autoScroll = true;
    els.resumeBtn.hidden = true;
    els.feed.innerHTML =
      '<div class="fl fl-idle"><span class="fl-prefix" aria-hidden="true">&#9656;</span>' +
      'fo_agent ready · scenario: ' + esc(state.sc.name) +
      ' · press Run to replay the recorded execution<span class="cursor" aria-hidden="true"></span></div>';
    els.planList.innerHTML = '';
    els.planEmpty.hidden = false;
    renderTally();
    resetArtifact();
    els.elapsed.textContent = '00:00.0';
    els.progressFill.style.width = '0%';
    setPill('idle');
    els.runBtn.textContent = 'Run ▸';
    els.runBtn.classList.add('pulse');
  }

  function startRun() {
    state.param = sanitizeParam(els.paramInput.value) || state.sc.paramDefault;
    els.paramInput.value = state.param;
    resetRun();
    els.feed.innerHTML = '';
    state.cum = [];
    var acc = 0;
    state.sc.events.forEach(function (e) {
      acc += (e.d || 0);
      state.cum.push(acc);
    });
    state.total = acc;
    state.running = true;
    state.lastTick = performance.now();
    els.paramInput.disabled = true;
    els.runBtn.textContent = 'Restart ⟲';
    els.runBtn.classList.remove('pulse');
    setPill('running');
    if (els.liveStatus) {
      els.liveStatus.textContent = 'Run started: ' + state.sc.name +
        ' with parameter ' + state.param;
    }
    renderBrief();
    updateClock();
  }

  function finishRun() {
    state.running = false;
    state.done = true;
    state.vClock = state.total;
    flushTypers();
    Object.keys(state.openCalls).forEach(function (k) {
      var r = state.openCalls[k];
      if (!r.userToggled && r.open) {
        r.open = false;
        r.block.classList.add('collapsed');
        r.head.setAttribute('aria-expanded', 'false');
      }
    });
    els.paramInput.disabled = false;
    els.runBtn.textContent = 'Replay ▸';
    setPill('complete');
    els.resumeBtn.hidden = true;
    updateClock();
    if (els.liveStatus) {
      els.liveStatus.textContent = 'Run complete: ' + state.sc.name +
        '. Deliverable available in the artifact panel.';
    }
  }

  function setPill(mode) {
    els.statusPill.className = 'status-pill ' + mode;
    els.statusPill.textContent =
      mode === 'running' ? 'running' : (mode === 'complete' ? 'complete' : 'idle');
  }

  function updateClock() {
    els.elapsed.textContent = fmtClock(state.vClock);
    var pct = state.total ? Math.min(100, state.vClock / state.total * 100) : 0;
    els.progressFill.style.width = pct + '%';
  }

  /* ---------- master ticker ---------- */
  window.setInterval(function () {
    var now = performance.now();
    var dt = now - (state.lastTick || now);
    state.lastTick = now;
    if (state.running) {
      state.vClock = Math.min(state.vClock + dt * state.speed, state.total);
      var ev = state.sc.events;
      while (state.idx < ev.length && state.cum[state.idx] <= state.vClock) {
        var e = ev[state.idx];
        state.idx++;
        fire(e, state.cum[state.idx - 1]);
        if (!state.running) break; // run_done fired
      }
      updateClock();
    }
    pumpTypers(dt);
  }, 80);

  /* ---------- scenario picker ---------- */
  function buildPicker() {
    ORDER.forEach(function (key) {
      var sc = SCN[key];
      if (!sc) return;
      var card = el('button', 'scn-card');
      card.type = 'button';
      card.id = 'scn-' + key;
      card.setAttribute('aria-pressed', 'false');
      card.innerHTML = '<span class="scn-tag">' + esc(sc.tag) + '</span>' +
        '<span class="scn-name">' + esc(sc.name) + '</span>' +
        '<span class="scn-blurb">' + esc(sc.blurb) + '</span>' +
        '<span class="scn-param"><i>' + esc(sc.paramLabel) + ':</i> ' +
        esc(sc.paramDefault) + '</span>';
      card.addEventListener('click', function () { select(key, true); });
      els.scnGrid.appendChild(card);
    });
  }

  function renderBrief() {
    var p = sanitizeParam(els.paramInput.value) || state.sc.paramDefault;
    var html = esc(state.sc.brief).split('{{param}}')
      .join('<mark class="brief-param">' + esc(p) + '</mark>');
    els.briefText.innerHTML = html;
  }

  function select(key, setHash) {
    if (key === state.key) return;
    if (!SCN[key]) key = ORDER[0];
    state.key = key;
    state.sc = SCN[key];
    state.param = state.sc.paramDefault;
    ORDER.forEach(function (k) {
      var c = $('scn-' + k);
      if (c) c.setAttribute('aria-pressed', k === key ? 'true' : 'false');
    });
    els.consoleName.textContent = state.sc.name;
    els.recordedNote.textContent = state.sc.recordedNote;
    els.paramLabel.textContent = state.sc.paramLabel;
    els.paramHint.textContent = state.sc.paramHint;
    els.paramInput.value = state.sc.paramDefault;
    els.paramInput.disabled = false;
    renderBrief();
    resetRun();
    if (setHash && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + key);
    }
  }

  /* ---------- controls wiring ---------- */
  els.runBtn.addEventListener('click', function () { startRun(); });

  els.speedGroup.addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('button[data-speed]') : null;
    if (!b) return;
    state.speed = parseInt(b.getAttribute('data-speed'), 10) || 1;
    var btns = els.speedGroup.querySelectorAll('button[data-speed]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i] === b ? 'true' : 'false');
    }
  });

  els.paramInput.addEventListener('input', renderBrief);
  els.paramInput.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !state.running) startRun();
  });

  window.addEventListener('hashchange', function () {
    var h = window.location.hash.replace('#', '');
    if (SCN[h] && h !== state.key) select(h, false);
  });

  /* ---------- boot ---------- */
  buildPicker();
  var initial = window.location.hash.replace('#', '');
  select(SCN[initial] ? initial : ORDER[0], false);
})();
