/**
 * dsh-plugin-composer-compact — hand-written web client half (no build step).
 *
 * The DSH web boot loads this file as a classic script; it only REGISTERS a
 * closure factory with the page-global module loader facade. All side effects
 * (stylesheet, html marker, toggle button, observers, listeners) live inside
 * the factory closure and run at MATERIALIZATION / fiber activation.
 *
 * Contract points:
 *  - registration id === package.json "name" (the boot graph row id);
 *  - the module exports object is what `loader.create({ name })` installs;
 *  - the injected <style> is tagged data-plugin / data-plugin-css exactly like
 *    an emitted bundle, so style ownership and cleanup keep working;
 *  - apply() is fully guarded: a failure here must never abort the web boot.
 *
 * Behaviour (see README):
 *  - collapsed (default) / expanded, persisted in localStorage
 *    "dsh.composerCompact", reflected on [data-composer-seat] as
 *    data-composer-compact-state, ONLY while the conversation is active;
 *  - collapsed keeps the native Lexical editor (24px, one line), the native
 *    send/stop button and this plugin's toggle; dock/+ /permission/plan/model
 *    are hidden and --dsh-composer-height follows the 52px seat;
 *  - the toggle re-mounts itself after a React re-render or a seat replacement
 *    (MutationObserver, rAF-debounced; no polling);
 *  - a second line (Shift+Enter / paste) auto-expands and persists, so the
 *    one-line viewport can never hide a newline.
 *
 * No imports, no React, no hashed class names.
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-composer-compact",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    /** Must equal package.json "name" — the boot graph row id. */
    const PLUGIN_ID = "dsh-plugin-composer-compact";
    /** Stable per-stylesheet tag id, same shape emitted bundles use. */
    const TAG_ID = PLUGIN_ID + "/composer-compact.css";
    const VERSION = "0.2.0";
    /** Persisted user choice; anything else falls back to "collapsed". */
    const STORAGE_KEY = "dsh.composerCompact";
    const STATE_ATTR = "data-composer-compact-state";
    const TOGGLE_ATTR = "data-composer-compact-toggle";
    const COLLAPSED = "collapsed";
    const EXPANDED = "expanded";
    /** Only a docked (active) conversation gets the compact treatment. */
    const ACTIVE_SELECTOR = '[data-conversation-content][data-content-phase="active"]';
    /** Nodes whose appearance/disappearance means "the composer was re-rendered". */
    const WATCH_SELECTOR = "[data-composer-seat], [data-composer-card], [data-composer-compact-toggle]";

    /**
     * Full stylesheet, inlined on purpose (no build step, no fetched assets).
     * Every collapse rule is guarded by the ACTIVE conversation phase, so hero /
     * empty conversations keep the native composer untouched. No rule is keyed
     * on a hashed CSS-module class name.
     */
    const CSS = `/* ============================================================
   dsh-plugin-composer-compact · collapsed composer (DSH 0.2.1-rc.3)
   Selector policy: data-* attributes / structure / aria only.
   NO hashed CSS-module class names, NO localized visible text.
   State lives on [data-composer-seat] as
   data-composer-compact-state="collapsed" | "expanded".
   Every collapse rule is guarded by the ACTIVE conversation phase, so hero /
   empty conversations keep the native composer untouched. The expand /
   collapse button is injected by client.js and carries
   [data-composer-compact-toggle].
   ============================================================ */

/* ---------- the plugin's own expand/collapse toggle (both states) ---------- */
[data-composer-compact-toggle] {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #9aa0a6);
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

[data-composer-compact-toggle] svg {
  display: block;
  width: 16px;
  height: 16px;
  transition: transform 120ms ease;
}

[data-composer-compact-toggle]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.16));
}

[data-composer-compact-toggle]:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4c8dff);
  outline-offset: 2px;
}

/* chevron points up (= expand) while collapsed, down (= collapse) while expanded */
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="expanded"] [data-composer-compact-toggle] svg {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  [data-composer-compact-toggle] svg { transition: none; }
}

/* ---------- collapsed: one slim bar ---------- */

/* 1. hide the dock row (activity pill / context-meter slot) and the attachment strip */
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-composer-dock],
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-slot="conversation.composer.dock"],
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-slot="conversation.input.attachments"] {
  display: none !important;
}

/* 2. card becomes a single 48px row: [editor] [toggle] [stop?] [send] */
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-composer-card] {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  box-sizing: border-box;
  height: 48px;
  padding: 2px 6px 2px 12px;
  border-radius: 24px;
}

/* 3. editor viewport: exactly one line, horizontally clipped */
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-composer-card] > div:has([contenteditable="true"]) {
  flex: 1 1 auto;
  min-width: 0;
  margin-right: 0;
  max-height: 24px;
  overflow: hidden;
}

[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-composer-card] [contenteditable="true"] {
  min-height: 24px;
  max-height: 24px;
  overflow: hidden;
  white-space: nowrap !important; /* Lexical sets pre-wrap inline */
  outline: none;
}

/* 4. control row: inline, only the trailing toggle + send/stop survive */
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-composer-card] > div:last-child {
  display: flex;
  align-items: center;
  flex: none;
  width: auto;
  container-type: normal; /* native row is a size container -> 0 intrinsic width */
  margin: 0;
  padding: 0;
}

/* 4a. leading group: + / permission chip / plan chip / left slot */
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-composer-card] > div:last-child > div:first-child {
  display: none !important;
}

/* 4b. trailing group: model picker / right slot / activity slot (every div but
       the last child; the native send/stop buttons are direct children) */
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-composer-card] > div:last-child > div:last-child > div:not(:last-child) {
  display: none !important;
}

/* 4c. explicit slots (belt and braces for a future DOM re-order) */
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-slot="conversation.input.permission"],
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-slot="conversation.input.plan"],
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-slot="conversation.input.model"] {
  display: none !important;
}

/* 4d. right group: only toggle + send, tighter gap; drop the native send offset */
[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-composer-card] > div:last-child > div:last-child {
  gap: 6px;
}

[data-conversation-content][data-content-phase="active"] [data-composer-seat][data-composer-compact-state="collapsed"] [data-composer-card] > div:last-child > div:last-child > button:last-child {
  transform: none;
}

/* ---------- expanded: native layout untouched ----------
   Every collapse rule above is keyed on the collapsed state, so dropping the
   attribute restores the native composer; the expanded toggle is the only
   added node (in the trailing control group). */
`;

    /** Inline chevron; static markup only (no interpolated data). */
    const CHEVRON_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 10.5 8 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

    function warn(message, error) {
      try { console.warn("[composer-compact] " + message, error); } catch (ignored) { /* console is best effort */ }
    }

    function isElement(node) {
      return node !== null && typeof node === "object" && node.nodeType === 1;
    }

    /** Read the persisted user choice; default is collapsed. Never throws. */
    function readState() {
      try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        return value === EXPANDED ? EXPANDED : COLLAPSED;
      } catch (error) {
        warn("localStorage read failed; defaulting to collapsed", error);
        return COLLAPSED;
      }
    }

    /** Persist the user choice. Never throws. */
    function writeState(next) {
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch (error) { warn("localStorage write failed", error); }
    }

    function matchesWatch(node) {
      if (!isElement(node)) return false;
      try {
        if (node.matches(WATCH_SELECTOR)) return true;
        if (typeof node.querySelector === "function" && node.querySelector(WATCH_SELECTOR) !== null) return true;
        if (typeof node.closest === "function" && node.closest(WATCH_SELECTOR) !== null) return true;
      } catch (error) {
        warn("mutation node match failed", error);
      }
      return false;
    }

    /**
     * Mount the runtime: stylesheet, html marker, state, toggle and listeners.
     * @returns disposer that removes every artefact and listener again.
     */
    function mountRuntime() {
      let disposed = false;
      let frame = 0;
      let cancelFrame = null;
      let state = readState();
      let seat = null;
      let card = null;
      let toggle = null;
      let observer = null;
      let observedEditor = null;
      let editorObserver = null;
      let editorCheckFrame = 0;
      let cancelEditorCheck = null;
      let composing = false;
      const root = document.documentElement;

      // ---- stylesheet + html marker -------------------------------------
      // Re-materialization must stay idempotent: drop our own stale artefacts.
      document.querySelectorAll('style[data-plugin-css="' + TAG_ID + '"]').forEach((node) => {
        try { node.remove(); } catch (error) { warn("stale style removal failed", error); }
      });
      document.querySelectorAll("[" + TOGGLE_ATTR + "]").forEach((node) => {
        try { node.remove(); } catch (error) { warn("stale toggle removal failed", error); }
      });
      document.querySelectorAll("[data-composer-seat][" + STATE_ATTR + "]").forEach((node) => {
        try { node.removeAttribute(STATE_ATTR); } catch (error) { warn("stale state removal failed", error); }
      });

      const styleTag = document.createElement("style");
      styleTag.dataset.plugin = PLUGIN_ID;
      styleTag.dataset.pluginCss = TAG_ID;
      styleTag.textContent = CSS;
      (document.head || root).appendChild(styleTag);
      root.setAttribute("data-composer-compact", "1");
      root.setAttribute("data-composer-compact-version", VERSION);

      // ---- toggle -------------------------------------------------------
      function updateToggleLabel() {
        if (toggle === null) return;
        const collapsed = state === COLLAPSED;
        toggle.setAttribute("aria-label", collapsed ? "展开输入框" : "收起输入框");
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        toggle.title = collapsed ? "展开输入框" : "收起输入框";
      }

      function applyState() {
        if (seat !== null && seat.isConnected) seat.setAttribute(STATE_ATTR, state);
        updateToggleLabel();
      }

      function setState(next, persist) {
        state = next;
        if (persist) writeState(next);
        applyState();
      }

      function onToggleMouseDown(event) {
        // Keep the caret in the editor: a mousedown on the button would blur it.
        event.preventDefault();
        event.stopPropagation();
      }

      function onToggleClick(event) {
        try {
          event.preventDefault();
          event.stopPropagation();
          setState(state === COLLAPSED ? EXPANDED : COLLAPSED, true);
        } catch (error) {
          warn("toggle click failed", error);
        }
      }

      function createToggle() {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute(TOGGLE_ATTR, "");
        button.setAttribute("aria-label", "展开输入框");
        button.setAttribute("aria-expanded", "false");
        button.title = "展开输入框";
        button.innerHTML = CHEVRON_SVG;
        button.addEventListener("mousedown", onToggleMouseDown);
        button.addEventListener("click", onToggleClick);
        return button;
      }

      function detachToggle() {
        if (toggle === null) return;
        try {
          toggle.removeEventListener("mousedown", onToggleMouseDown);
          toggle.removeEventListener("click", onToggleClick);
        } catch (error) {
          warn("toggle listener removal failed", error);
        }
        try { if (toggle.parentNode !== null) toggle.parentNode.removeChild(toggle); } catch (error) { warn("toggle removal failed", error); }
        toggle = null;
      }

      /**
       * Put the toggle into the trailing control group as its first item.
       * First-item placement is deliberate: the trailing group grows to the
       * left, so every native control (+ / permission / model / send) keeps its
       * expanded-state rectangle, and in the collapsed bar the toggle ends up
       * immediately left of the native send button.
       */
      function mountToggle(nextCard) {
        const row = nextCard.lastElementChild;
        const trailing = row === null ? null : row.lastElementChild;
        if (trailing === null || trailing === toggle) return;
        if (toggle === null) toggle = createToggle();
        if (toggle.parentElement !== trailing || toggle !== trailing.firstElementChild) {
          trailing.insertBefore(toggle, trailing.firstElementChild);
        }
        updateToggleLabel();
      }

      // ---- editor: auto-expand on a second line -------------------------
      // Lexical consumes beforeinput and usually suppresses the native input
      // event, and it replaces the contenteditable node on the first edit. The
      // listeners therefore sit on the seat (capture phase) and every check
      // re-queries the live editor; a private MutationObserver watches the
      // current contenteditable, so a DOM commit without an input event (paste,
      // IME) is still observed.
      function currentEditor() {
        if (seat === null) return null;
        return seat.querySelector('[contenteditable="true"]');
      }

      /**
       * True when the draft needs more than the one-line viewport.
       * The collapsed editor is 24px high but a *single* line already reports
       * scrollHeight 28 (4px padding + 24px line box), so the plain
       * scrollHeight > clientHeight + 2 test would expand on any text. The
       * primary signal is an explicit line break in innerText (Shift+Enter,
       * paste); the fallback is vertical growth beyond half a line, which still
       * catches wrapping if the nowrap rule ever stops applying.
       */
      function hasSecondLine(target) {
        try {
          const text = typeof target.innerText === "string" ? target.innerText : "";
          let stripped = text;
          if (stripped.endsWith("\n")) stripped = stripped.slice(0, -1);
          if (stripped.indexOf("\n") !== -1) return true;
          const computed = window.getComputedStyle(target);
          let lineHeight = parseFloat(computed.lineHeight);
          if (!isFinite(lineHeight) || lineHeight <= 0) lineHeight = 24;
          const threshold = Math.max(6, lineHeight * 0.5);
          return target.scrollHeight - target.clientHeight > threshold;
        } catch (error) {
          warn("line measurement failed", error);
          return false;
        }
      }

      function maybeAutoExpand() {
        if (disposed || state !== COLLAPSED || composing) return;
        const target = currentEditor();
        if (target === null) return;
        if (hasSecondLine(target)) setState(EXPANDED, true);
      }

      function eventIsFromEditor(event) {
        if (event === null || event === undefined) return false;
        const target = event.target;
        if (!isElement(target)) return false;
        try { return target.closest('[contenteditable="true"]') !== null; } catch (error) { return false; }
      }

      function onSeatInput(event) {
        if (eventIsFromEditor(event)) maybeAutoExpand();
      }

      function onSeatBeforeInput(event) {
        try {
          if (!eventIsFromEditor(event) || state !== COLLAPSED || composing) return;
          const inputType = event.inputType === undefined ? "" : String(event.inputType);
          if (inputType === "insertLineBreak" || inputType === "insertParagraph") {
            setState(EXPANDED, true);
            return;
          }
          const data = typeof event.data === "string" ? event.data : "";
          if (data.indexOf("\n") !== -1) setState(EXPANDED, true);
        } catch (error) {
          warn("beforeinput handling failed", error);
        }
      }

      function onSeatKeyDown(event) {
        try {
          if (!eventIsFromEditor(event) || state !== COLLAPSED || composing) return;
          if (event.key === "Enter" && event.shiftKey === true) setState(EXPANDED, true);
        } catch (error) {
          warn("keydown handling failed", error);
        }
      }

      function onCompositionStart(event) {
        if (eventIsFromEditor(event)) composing = true;
      }

      function onCompositionEnd(event) {
        if (!eventIsFromEditor(event)) return;
        composing = false;
        scheduleEditorCheck();
      }

      function observeEditor() {
        const next = currentEditor();
        if (next === observedEditor) return;
        if (editorObserver !== null) {
          try { editorObserver.disconnect(); } catch (error) { warn("editor observer disconnect failed", error); }
          editorObserver = null;
        }
        observedEditor = next;
        if (next === null || typeof MutationObserver !== "function") return;
        try {
          editorObserver = new MutationObserver(function () { scheduleEditorCheck(); });
          editorObserver.observe(next, { childList: true, subtree: true, characterData: true });
        } catch (error) {
          warn("editor observer setup failed", error);
          editorObserver = null;
        }
      }

      function scheduleEditorCheck() {
        if (disposed || editorCheckFrame !== 0) return;
        try {
          if (typeof window.requestAnimationFrame === "function") {
            const id = window.requestAnimationFrame(function () { editorCheckFrame = 0; maybeAutoExpand(); });
            editorCheckFrame = id;
            cancelEditorCheck = function () { window.cancelAnimationFrame(id); };
          } else {
            const id = window.setTimeout(function () { editorCheckFrame = 0; maybeAutoExpand(); }, 16);
            editorCheckFrame = id;
            cancelEditorCheck = function () { window.clearTimeout(id); };
          }
        } catch (error) {
          warn("editor check scheduling failed", error);
        }
      }

      function detachEditorWatch() {
        if (editorObserver !== null) {
          try { editorObserver.disconnect(); } catch (error) { warn("editor observer disconnect failed", error); }
          editorObserver = null;
        }
        observedEditor = null;
        if (cancelEditorCheck !== null) {
          try { cancelEditorCheck(); } catch (error) { warn("editor check cancellation failed", error); }
          cancelEditorCheck = null;
        }
        editorCheckFrame = 0;
        composing = false;
      }

      const SEAT_EVENTS = [
        ["input", onSeatInput],
        ["beforeinput", onSeatBeforeInput],
        ["keydown", onSeatKeyDown],
        ["compositionstart", onCompositionStart],
        ["compositionend", onCompositionEnd],
      ];

      function attachSeatListeners() {
        if (seat === null) return;
        try {
          for (let index = 0; index < SEAT_EVENTS.length; index += 1) seat.addEventListener(SEAT_EVENTS[index][0], SEAT_EVENTS[index][1], true);
        } catch (error) {
          warn("seat listener attach failed", error);
        }
      }

      function detachSeatListeners() {
        if (seat === null) return;
        try {
          for (let index = 0; index < SEAT_EVENTS.length; index += 1) seat.removeEventListener(SEAT_EVENTS[index][0], SEAT_EVENTS[index][1], true);
        } catch (error) {
          warn("seat listener removal failed", error);
        }
      }

      // ---- seat / card synchronisation ----------------------------------
      function detachSeat() {
        detachSeatListeners();
        detachEditorWatch();
        detachToggle();
        if (seat !== null) {
          try { seat.removeAttribute(STATE_ATTR); } catch (error) { warn("state attribute removal failed", error); }
        }
        seat = null;
        card = null;
      }

      function sync() {
        frame = 0;
        if (disposed) return;
        try {
          const content = document.querySelector(ACTIVE_SELECTOR);
          if (content === null) { detachSeat(); return; }
          const nextSeat = content.querySelector("[data-composer-seat]");
          if (nextSeat === null) { detachSeat(); return; }
          if (nextSeat !== seat) {
            detachSeat();
            seat = nextSeat;
            attachSeatListeners();
          }
          if (seat.getAttribute(STATE_ATTR) !== state) seat.setAttribute(STATE_ATTR, state);
          const nextCard = seat.querySelector("[data-composer-card]");
          if (nextCard === null) {
            detachToggle();
            detachEditorWatch();
            card = null;
            return;
          }
          card = nextCard;
          mountToggle(card);
          observeEditor();
        } catch (error) {
          warn("sync failed; page left untouched", error);
        }
      }

      function schedule() {
        if (disposed || frame !== 0) return;
        try {
          if (typeof window.requestAnimationFrame === "function") {
            const id = window.requestAnimationFrame(function () { frame = 0; sync(); });
            frame = id;
            cancelFrame = function () { window.cancelAnimationFrame(id); };
          } else {
            const id = window.setTimeout(function () { frame = 0; sync(); }, 16);
            frame = id;
            cancelFrame = function () { window.clearTimeout(id); };
          }
        } catch (error) {
          warn("scheduling failed", error);
        }
      }

      function shouldSchedule(records) {
        for (let index = 0; index < records.length; index += 1) {
          const record = records[index];
          if (record.type === "attributes") return true;
          const target = record.target;
          if (seat !== null && isElement(target) && (target === seat || seat.contains(target))) return true;
          for (let added = 0; added < record.addedNodes.length; added += 1) {
            if (matchesWatch(record.addedNodes[added])) return true;
          }
          for (let removed = 0; removed < record.removedNodes.length; removed += 1) {
            if (matchesWatch(record.removedNodes[removed])) return true;
          }
        }
        return false;
      }

      if (typeof MutationObserver === "function") {
        try {
          observer = new MutationObserver(function (records) {
            try {
              if (shouldSchedule(records)) schedule();
            } catch (error) {
              warn("mutation handling failed", error);
            }
          });
          observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["data-content-phase", "data-conversation-session"],
          });
        } catch (error) {
          warn("MutationObserver setup failed; toggle may not re-mount", error);
          observer = null;
        }
      }

      // ---- cross-window preference sync (optional) ----------------------
      function onStorage(event) {
        try {
          if (event.key !== STORAGE_KEY) return;
          const next = event.newValue === EXPANDED ? EXPANDED : COLLAPSED;
          if (next === state) return;
          state = next;
          applyState();
        } catch (error) {
          warn("storage event handling failed", error);
        }
      }
      window.addEventListener("storage", onStorage);

      // First pass; later passes are driven by the observer.
      sync();

      return function dispose() {
        disposed = true;
        try { if (observer !== null) observer.disconnect(); } catch (error) { warn("observer disconnect failed", error); }
        if (cancelFrame !== null) { try { cancelFrame(); } catch (error) { warn("frame cancellation failed", error); } }
        frame = 0;
        try { window.removeEventListener("storage", onStorage); } catch (error) { warn("storage listener removal failed", error); }
        detachSeat();
        try { if (styleTag.parentNode !== null) styleTag.remove(); } catch (error) { warn("style removal failed", error); }
        try { root.removeAttribute("data-composer-compact"); } catch (error) { warn("html marker removal failed", error); }
        try { root.removeAttribute("data-composer-compact-version"); } catch (error) { warn("html version marker removal failed", error); }
      };
    }

    /**
     * Cordis entry point. Every step is guarded: an exception thrown from here
     * would abort the whole web boot ("Failed to load plugins"), so this
     * function only ever warns and leaves the page alone.
     */
    function apply(scope) {
      try {
        if (typeof document === "undefined" || document === null) return;
        if (scope === null || typeof scope !== "object" || typeof scope.effect !== "function") {
          warn("no cordis scope.effect; composer stays native");
          return;
        }
        scope.effect(function () {
          try {
            return mountRuntime();
          } catch (error) {
            warn("mount failed; composer stays native", error);
            return function () {};
          }
        }, "composer-compact: collapsed composer");
        try { console.log("[composer-compact] loaded v" + VERSION); } catch (ignored) { /* console is best effort */ }
      } catch (error) {
        warn("apply failed; composer stays native", error);
      }
    }

    module.exports = { name: "composer-compact", apply };
    return module.exports;
  },
});
