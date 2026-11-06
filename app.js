/* User study 1: which animation best follows the prompt?
 * Static, no server. Each participant gets their own random order of the questions (within each
 * part) and of the three animations (A, B, C) on every question. At the end the answers are saved
 * as a JSON file the participant downloads and sends back; collected files go in responses/.
 * Progress is kept in this browser (localStorage) so a reload does not lose answers. */
(function () {
  "use strict";
  const STUDY = "userstudy_1_prompt_adherence";
  const VERSION = 1;
  const STORE = "us1_state_v" + VERSION;
  const Q = window.STUDY_QUESTIONS || [];
  const BLOCKS = {
    shape_motion: { title: "Part 1 of 2", note: "In this part each method may reshape the letter toward the prompt and animate it." },
    motion_only: { title: "Part 2 of 2", note: "In this part the letter keeps its shape. Only its motion differs between the animations." }
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
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* private mode: fine */ } }
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; } }

  // ---------- state ----------
  function fresh() {
    const order = [];
    for (const b of Object.keys(BLOCKS)) order.push(...shuffled(Q.filter(q => q.block === b).map(q => q.id)));
    const clipOrder = {};
    for (const q of Q) clipOrder[q.id] = shuffled(q.clips.map(c => c.id));
    return { study: STUDY, version: VERSION, session: rid(), started: null, finished: null,
             order, clipOrder, answers: {}, page: -1 };
  }
  let state = load();
  if (!state || state.version !== VERSION || !state.order || state.order.length !== Q.length) state = fresh();
  const byId = Object.fromEntries(Q.map(q => [q.id, q]));

  // ---------- screens ----------
  function render() {
    window.scrollTo(0, 0);
    app.replaceChildren();
    if (state.page < 0) return intro();
    if (state.page >= state.order.length) return done();
    return question(state.page);
  }

  function intro() {
    app.append(
      el("h1", {}, "Animated letters: which one follows the prompt?"),
      el("div", { class: "panel" },
        el("p", {}, "Each page shows a short text prompt, the original letter, and three looping animations of that letter made by different methods."),
        el("ul", { class: "steps" },
          el("li", {}, "Watch all three animations for a few loops."),
          el("li", {}, "Choose the one whose motion best performs the action described in the prompt."),
          el("li", {}, "Judge the motion: does the letter move the way the prompt says? Small differences in drawing quality do not matter here.")),
        el("p", {}, "There are " + Q.length + " pages in two short parts and it takes about 5 minutes. There are no right or wrong answers."),
        el("p", { class: "muted small" }, "Your answers stay in this browser until the end, where you download them as a small file and send it back to us. Nothing else is recorded.")),
      el("div", { class: "nav" }, el("span"),
        el("button", { class: "btn", onclick: () => {
          state.started = state.started || new Date().toISOString();
          state.page = 0; save(); render();
        } }, Object.keys(state.answers).length ? "Continue" : "Start")));
  }

  function question(i) {
    const q = byId[state.order[i]];
    const block = BLOCKS[q.block];
    const shownAt = Date.now();
    const ans = state.answers[q.id];
    const ids = state.clipOrder[q.id];
    const clipById = Object.fromEntries(q.clips.map(c => [c.id, c]));
    const bust = "?v=" + shownAt;                       // restart every GIF together on each visit
    const next = el("button", { class: "btn", disabled: ans ? null : "" }, i === state.order.length - 1 ? "Finish" : "Next");
    const buttons = ids.map((cid, k) => {
      const letter = "ABC"[k];
      const b = el("button", { class: "choice", type: "button", "aria-pressed": ans && ans.choice === cid ? "true" : "false",
                               "aria-label": "Animation " + letter },
        el("img", { src: clipById[cid].src + bust, alt: "Animation " + letter, loading: "eager" }),
        el("div", { class: "lab" }, "Animation " + letter));
      b.addEventListener("click", () => {
        buttons.forEach(x => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        const prev = state.answers[q.id];
        state.answers[q.id] = { choice: cid, position: letter, shown: ids,
                                seconds_to_choice: Math.round((Date.now() - shownAt) / 100) / 10,
                                changed: prev ? (prev.changed || 0) + (prev.choice !== cid ? 1 : 0) : 0 };
        next.removeAttribute("disabled"); save();
      });
      return b;
    });
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
        el("p", { class: "question" }, "Which animation best performs the action in the prompt?"),
        el("div", { class: "row" },
          el("div", { class: "source" }, el("img", { src: q.input, alt: "The original letter" }), el("div", { class: "lab" }, "Original letter")),
          el("div", { class: "choices" }, buttons))),
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
    const missing = data.answers.filter(a => !a.choice).length;
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
    app.append(
      el("h1", {}, "Thank you!"),
      el("div", { class: "panel" },
        missing ? el("p", {}, "You skipped " + missing + " page(s). You can go back and answer them, or send the file as it is.") : null,
        el("p", {}, "Please download your answers and send the file back to us. That is the only way we receive them."),
        el("div", { class: "actions" }, el("button", { class: "btn", onclick: download }, "Download answers (" + fname + ")"), copyBtn),
        el("p", { class: "muted small", style: "margin-top:14px" }, "If the download does not work on your device, copy the text below and send it instead."),
        ta),
      el("div", { class: "nav" },
        el("button", { class: "btn secondary", onclick: () => { state.page = state.order.length - 1; save(); render(); } }, "Back"),
        el("button", { class: "btn secondary", onclick: () => {
          if (confirm("Start over? Your current answers in this browser will be cleared.")) { state = fresh(); save(); render(); }
        } }, "Start over")));
  }

  // ?preview=N shows page N (0-based; "done" for the last screen) for checking the layout. It uses a
  // throwaway state and never touches the participant's saved answers.
  const pv = new URLSearchParams(location.search).get("preview");
  if (pv !== null) {
    state = fresh(); save = function () {};
    if (pv === "done") { state.order.forEach(id => { state.answers[id] = { choice: state.clipOrder[id][0], position: "A" }; }); state.page = state.order.length; }
    else state.page = Math.max(-1, Math.min(Q.length - 1, parseInt(pv, 10) || 0));
  }
  // preload every clip once so pages show instantly
  for (const q of Q) for (const c of q.clips) { const im = new Image(); im.src = c.src; }
  render();
})();
