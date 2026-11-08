/* User study 1: which animation best follows the prompt?
 * Static, no server. Each participant gets their own random order of the questions (within each
 * part) and of the three animations (A, B, C) on every question. At the end the answers are sent
 * to a Google Sheet (SUBMIT_URL, see userstudies/sheet_collector); a JSON download stays as a backup.
 * Progress is kept in this browser (localStorage) so a reload does not lose answers. */
(function () {
  "use strict";
  const STUDY = "userstudy_1_prompt_adherence";
  const VERSION = 19;         // 19 = reset (2026-11-08): all examples removed, 10 empty slots per section; 18 = q03 horseshoe magnet, q20 tail wagging (2026-11-06); 17 answers score with key_v17.json
  const STORE = "us1_state_v" + VERSION;
  const SUBMIT_URL = "https://script.google.com/macros/s/AKfycbzAROXydxaAtQYXPOmOT-Eaym6FIzo-LJIo8dxoVcNalQQ2iUsAj95FqXgCMrapHKV61g/exec";         // Google Apps Script web app that adds answers to a Google Sheet (userstudies/sheet_collector); empty = download only
  const Q = window.STUDY_QUESTIONS || [];
  // *word* is shown in bold
  const BLOCKS = {
    shape_motion: {
      title: "Section 1 of 2",
      intro: ["In this section, each method *deforms the letter*: its shape is reshaped toward the prompt and then animated, so the letter will not look exactly like the original however, the output should still have the basic topology/structure of the letter.",
              "Rank the three animations by how well their motion performs the action described in the prompt in a strong way while keeping the shape of input letter."],
      note: "Section 1: the letter's shape is deformed toward the prompt and animated.",
      question: "Rank the animations from best to worst based on how well each one *performs the prompted action*, *preserves the original letter* shape with *natural motion*." },
    motion_only: {
      title: "Section 2 of 2",
      intro: ["In this section there is *no deformation*: the letter keeps its original shape and only moves.",
              "Please rank which animation does the best job of *interpreting* the motion in the prompt onto the letter."],
      note: "Section 2: no deformation. The letter keeps its shape and only moves.",
      question: "Rank the animations from best to worst: which one *best interprets the motion in the prompt* onto the letter?" }
  };
  const app = document.getElementById("app");

  // ---------- small helpers ----------
  function rid() {
    const a = new Uint32Array(2);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return a[0].toString(16).padStart(8, "0") + a[1].toString(16).padStart(8, "0");
  }
  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const r = new Uint32Array(1); crypto.getRandomValues(r);
      const j = r[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) n.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined) n.append(c.nodeType ? c : document.createTextNode(c));
    return n;
  }
  function rich(text) {                                  // "*bold*" -> <strong>bold</strong>
    return text.split(/(\*[^*]+\*)/).filter(Boolean).map(t => t.startsWith("*") ? el("strong", {}, t.slice(1, -1)) : t);
  }
  // ---------- play each animation once ----------
  // A GIF loops only if it carries a NETSCAPE2.0 (or ANIMEXTS1.0) application block. We fetch each clip,
  // drop that block and show the result from a blob URL, so it plays once and stops on its last frame.
  // A new blob URL restarts it (Replay). If fetching fails (e.g. opened from file://), the original file is shown.
  function stripLoop(b) {
    if (b.length < 13 || String.fromCharCode(b[0], b[1], b[2]) !== "GIF") return b;
    let i = 13;
    if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 7) + 1));          // global colour table
    const skipSub = j => { while (j < b.length && b[j] !== 0) j += b[j] + 1; return j + 1; };
    while (i < b.length) {
      if (b[i] === 0x21) {                                       // extension
        if (b[i + 1] === 0xFF && b[i + 2] === 0x0B) {
          const id = String.fromCharCode(...b.subarray(i + 3, i + 14));
          if (id === "NETSCAPE2.0" || id === "ANIMEXTS1.0") {
            const end = skipSub(i + 2), out = new Uint8Array(b.length - (end - i));
            out.set(b.subarray(0, i)); out.set(b.subarray(end), i);
            return out;
          }
        }
        i = skipSub(i + 2);
      } else if (b[i] === 0x2C) {                                // image: descriptor, local colour table, LZW data
        const lct = b[i + 9] & 0x80 ? 3 * (1 << ((b[i + 9] & 7) + 1)) : 0;
        i = skipSub(i + 10 + lct + 1);
      } else break;                                              // 0x3B trailer or unknown
    }
    return b;
  }
  const onceCache = {};
  function playOnce(src) {                                       // -> Promise<Blob or null>, fetched once per clip
    if (!onceCache[src]) onceCache[src] = fetch(src).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(buf => new Blob([stripLoop(new Uint8Array(buf))], { type: "image/gif" })).catch(() => null);
    return onceCache[src];
  }
  let liveUrls = [];
  function releaseUrls() { liveUrls.forEach(u => URL.revokeObjectURL(u)); liveUrls = []; }

  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* private mode: fine */ } }
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; } }

  // ---------- state ----------
  function fresh() {
    const order = [];
    for (const b of Object.keys(BLOCKS)) order.push(...shuffled(Q.filter(q => q.block === b).map(q => q.id)));
    const clipOrder = {};
    for (const q of Q) clipOrder[q.id] = shuffled(q.clips.map(c => c.id));
    return { study: STUDY, version: VERSION, session: rid(), started: null, finished: null,
             order, clipOrder, answers: {}, page: -1, seenIntro: {} };
  }
  let state = load();
  if (!state || state.version !== VERSION || !state.order || state.order.length !== Q.length) state = fresh();
  const byId = Object.fromEntries(Q.map(q => [q.id, q]));

  // ---------- screens ----------
  function render() {
    window.scrollTo(0, 0);
    releaseUrls();
    app.replaceChildren();
    if (state.page < 0) return intro();
    if (state.page >= state.order.length) return done();
    const blk = byId[state.order[state.page]].block;           // first page of a section: its intro first
    const first = state.order.findIndex(id => byId[id].block === blk);
    if (state.page === first && !(state.seenIntro || {})[blk]) return sectionIntro(blk, state.page);
    return question(state.page);
  }

  function intro() {
    app.append(
      el("h1", {}, "Animated letters: which one follows the prompt?"),
      el("div", { class: "panel" },
        el("p", {}, el("strong", {}, "This study has two sections of " + (Q.length / 2) + " pages each."), " It should take less than 5 minutes to complete both. Each page shows a short text prompt, the original letter, and three looping animations of that letter made by different methods."),
        el("ul", { class: "steps" },
          el("li", {}, "Watch all three animations. Each one plays once; press Replay to watch them again."),
          el("li", {}, "Rank them from best to worst by how well their motion performs the action in the prompt. Click the best one first, then the second best; the last one is ranked for you."),
          el("li", {}, "Judge the motion based on how well it follows the prompt while keeping good motion quality.")),
        el("p", {}, "Each section starts with a short note on what to look for.")),
      el("div", { class: "nav" }, el("span"),
        el("button", { class: "btn", onclick: () => {
          state.started = state.started || new Date().toISOString();
          state.page = 0; save(); render();
        } }, Object.keys(state.answers).length ? "Continue" : "Start")));
  }

  function sectionIntro(blk, i) {
    const b = BLOCKS[blk];
    app.append(
      el("div", { class: "topbar" }, el("strong", {}, b.title), el("span", { class: "muted small" }, "Page " + (i + 1) + " of " + state.order.length)),
      el("div", { class: "progress", "aria-hidden": "true" }, el("div", { style: "width:" + Math.round(100 * i / state.order.length) + "%" })),
      el("div", { class: "panel sectionintro" }, el("h2", {}, b.title), ...b.intro.map(t => el("p", {}, ...rich(t)))),
      el("div", { class: "nav" },
        el("button", { class: "btn secondary", onclick: () => { state.page = i - 1; save(); render(); } }, "Back"),
        el("button", { class: "btn", onclick: () => { state.seenIntro = Object.assign(state.seenIntro || {}, { [blk]: true }); save(); render(); } },
           "Start " + b.title.replace(" of 2", "").toLowerCase())));
  }

  function emptySlot(i, q, block) {                     // a slot with no example chosen yet
    const next = el("button", { class: "btn", onclick: () => { state.page = i + 1; if (state.page >= state.order.length) state.finished = new Date().toISOString(); save(); render(); } },
                    i === state.order.length - 1 ? "Finish" : "Next");
    app.append(
      el("div", { class: "topbar" }, el("strong", {}, block.title), el("span", { class: "muted small" }, "Page " + (i + 1) + " of " + state.order.length)),
      el("div", { class: "progress", "aria-hidden": "true" }, el("div", { style: "width:" + Math.round(100 * i / state.order.length) + "%" })),
      el("div", { class: "panel" }, el("p", { class: "muted" }, "Example " + q.id + " has not been added yet.")),
      el("div", { class: "nav" }, el("button", { class: "btn secondary", onclick: () => { state.page = i - 1; save(); render(); } }, "Back"), next));
  }

  function question(i) {
    const q = byId[state.order[i]];
    const block = BLOCKS[q.block];
    if (!q.clips.length) return emptySlot(i, q, block);
    const shownAt = Date.now();
    const ans = state.answers[q.id];
    const ids = state.clipOrder[q.id];
    const clipById = Object.fromEntries(q.clips.map(c => [c.id, c]));
    const N = ids.length, ORD = ["1st", "2nd", "3rd", "4th"];
    let rank = (ans && ans.ranking && ans.ranking.length === N) ? ans.ranking.slice() : [];   // clip ids, best -> worst
    let resets = ans ? (ans.resets || 0) : 0;
    let replays = ans ? (ans.replays || 0) : 0;
    const next = el("button", { class: "btn", disabled: "" }, i === state.order.length - 1 ? "Finish" : "Next");
    const hint = el("p", { class: "muted small hint" });
    const clear = el("button", { class: "btn secondary", type: "button" }, "Clear ranking");
    const badges = {}, imgs = {};
    const buttons = ids.map((cid, k) => {
      const letter = "ABC"[k];
      badges[cid] = el("div", { class: "rank" });
      const b = el("button", { class: "choice", type: "button", "aria-label": "Animation " + letter },
        badges[cid], imgs[cid] = el("img", { alt: "Animation " + letter, loading: "eager" }),
        el("div", { class: "lab" }, "Animation " + letter));
      b.addEventListener("click", () => {
        if (rank.includes(cid)) return;                    // already ranked: use Clear ranking to redo
        rank.push(cid);
        if (rank.length === N - 1) rank.push(ids.find(x => !rank.includes(x)));   // the last one is implied
        paint(); commit();
      });
      return b;
    });
    const replay = el("button", { class: "btn secondary", type: "button", disabled: "" }, "\u21BB Replay");
    let blobs = null;
    function play() {                                        // (re)start all three together
      releaseUrls();
      ids.forEach(cid => {
        if (blobs && blobs[cid]) { const u = URL.createObjectURL(blobs[cid]); liveUrls.push(u); imgs[cid].src = u; }
        else imgs[cid].src = clipById[cid].src + "?v=" + Date.now();
      });
    }
    replay.addEventListener("click", () => { replays++; play(); commit(); });
    Promise.all(ids.map(cid => playOnce(clipById[cid].src))).then(bs => {
      if (state.order[state.page] !== q.id) return;          // page changed while loading
      blobs = Object.fromEntries(ids.map((cid, k) => [cid, bs[k]]));
      play(); replay.removeAttribute("disabled");
    });
    function paint() {
      buttons.forEach((b, k) => {
        const r = rank.indexOf(ids[k]);
        b.setAttribute("data-rank", r < 0 ? "" : String(r + 1));
        b.setAttribute("aria-pressed", r < 0 ? "false" : "true");
        badges[ids[k]].textContent = r < 0 ? "" : ORD[r] + (r === 0 ? " (best)" : r === N - 1 ? " (worst)" : "");
      });
      hint.textContent = rank.length === 0 ? "Click the best animation first."
                       : rank.length < N ? "Now click the second best. The last one is ranked for you."
                       : "Ranked. Use Clear ranking to change it.";
      if (rank.length === N) next.removeAttribute("disabled"); else next.setAttribute("disabled", "");
      clear.disabled = rank.length === 0;
    }
    function commit() {
      if (rank.length === N) state.answers[q.id] = { ranking: rank.slice(), positions: rank.map(c => "ABC"[ids.indexOf(c)]),
                                                     shown: ids, seconds_to_rank: Math.round((Date.now() - shownAt) / 100) / 10, resets, replays };
      else delete state.answers[q.id];
      save();
    }
    clear.addEventListener("click", () => { if (rank.length) resets++; rank = []; paint(); commit(); });
    paint();
    next.addEventListener("click", () => { state.page = i + 1; if (state.page >= state.order.length) state.finished = new Date().toISOString(); save(); render(); });
    const back = el("button", { class: "btn secondary", onclick: () => { state.page = i - 1; save(); render(); } }, "Back");
    const pct = Math.round(100 * i / state.order.length);
    app.append(
      el("div", { class: "topbar" }, el("strong", {}, block.title), el("span", { class: "muted small" }, "Page " + (i + 1) + " of " + state.order.length)),
      el("div", { class: "progress", "aria-hidden": "true" }, el("div", { style: "width:" + pct + "%" })),
      el("div", { class: "panel" },
        el("p", { class: "muted small blocknote" }, block.note),
        el("div", { class: "muted small" }, "Prompt"),
        el("p", { class: "prompt" }, q.prompt),
        el("p", { class: "question" }, ...rich(block.question)),
        el("div", { class: "replaybar" }, el("span", { class: "muted small" }, "Each animation plays once."), replay),
        el("div", { class: "row" },
          el("div", { class: "source" }, el("img", { src: q.input, alt: "The original shape" }), el("div", { class: "lab" }, "Original Shape")),   // same size as each animation
          el("div", { class: "choices" }, buttons)),
        el("div", { class: "rankbar" }, hint, clear)),
      el("div", { class: "nav" }, back, next));
  }

  function result() {
    return {
      study: STUDY, version: VERSION, session: state.session,
      started: state.started, finished: state.finished, user_agent: navigator.userAgent,
      answers: state.order.map((qid, k) => Object.assign({ question: qid, page: k + 1, block: byId[qid].block, prompt: byId[qid].prompt },
                                                        state.answers[qid] || {}))
    };
  }

  function done() {
    const data = result();
    const text = JSON.stringify(data, null, 1);
    const fname = "us1_" + state.session + ".json";
    const missing = data.answers.filter(a => !a.ranking).length;
    const download = () => {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = el("a", { href: url, download: fname }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    const ta = el("textarea", { readonly: "", "aria-label": "Your answers" }); ta.value = text;
    const copyBtn = el("button", { class: "btn secondary" }, "Copy answers");
    copyBtn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(text); copyBtn.textContent = "Copied"; }
      catch (e) { ta.select(); document.execCommand("copy"); copyBtn.textContent = "Copied"; }
    });
    const status = el("p", { class: "status" });
    const retry = el("button", { class: "btn", type: "button", style: "display:none" }, "Try again");
    const backup = [
      el("div", { class: "actions" }, el("button", { class: "btn secondary", onclick: download }, "Download answers (" + fname + ")"), copyBtn),
      el("p", { class: "muted small", style: "margin-top:14px" }, "If the download does not work on your device, copy the text below and send it instead."),
      ta];
    const sig = JSON.stringify(data.answers);
    const isPreview = new URLSearchParams(location.search).has("preview");
    function send() {                                   // add the answers to the Google Sheet
      if (missing === data.answers.length) { status.textContent = "There are no answers to save yet."; return; }   // e.g. all slots still empty: keep the sheet clean
      if (!SUBMIT_URL || isPreview) { status.textContent = "Please download your answers and send the file back to us."; return; }
      if (state.submittedSig === sig) { status.textContent = "Your answers have been saved. Thank you, you can close this page."; return; }
      status.textContent = "Saving your answers..."; retry.style.display = "none";
      fetch(SUBMIT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: text })   // plain text: no CORS preflight, which Apps Script cannot answer
        .then(r => r.json().then(j => { if (!(r.ok && j.ok)) throw new Error(j.error || String(r.status)); }))
        .then(() => { state.submittedSig = sig; save(); status.textContent = "Your answers have been saved. Thank you, you can close this page."; })
        .catch(() => { status.textContent = "We could not save your answers automatically. Please try again, or download them below and send the file to us."; retry.style.display = ""; });
    }
    retry.addEventListener("click", send);
    app.append(
      el("h1", {}, "Thank you!"),
      el("div", { class: "panel" },
        missing ? el("p", {}, "You skipped " + missing + " page(s). You can go back and answer them first.") : null,
        status, retry,
        SUBMIT_URL ? el("details", { class: "backup" }, el("summary", { class: "muted small" }, "Keep a copy of your answers"), ...backup)
                   : el("div", {}, ...backup)),
      el("div", { class: "nav" },
        el("button", { class: "btn secondary", onclick: () => { state.page = state.order.length - 1; save(); render(); } }, "Back"),
        el("button", { class: "btn secondary", onclick: () => {
          if (confirm("Start over? Your current answers in this browser will be cleared.")) { state = fresh(); save(); render(); }
        } }, "Start over")));
    send();
  }

  // ?preview=N shows page N (0-based; "done" for the last screen) for checking the layout. It uses a
  // throwaway state and never touches the participant's saved answers.
  const pv = new URLSearchParams(location.search).get("preview");
  if (pv !== null) {
    state = fresh(); save = function () {};
    if (pv === "done") { state.order.forEach(id => { state.answers[id] = { ranking: state.clipOrder[id].slice(), positions: ["A", "B", "C"] }; }); state.page = state.order.length; }
    else state.page = Math.max(-1, Math.min(Q.length - 1, parseInt(pv, 10) || 0));
  }
  // preload every clip once so pages show instantly
  for (const q of Q) for (const c of q.clips) playOnce(c.src);
  render();
})();
