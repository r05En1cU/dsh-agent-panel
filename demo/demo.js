/**
 * Zero-build demo harness for the dsh-plugin-agent-team-panel browser half.
 *
 * What it does (no bundler, no fetch layer, no DSH runtime):
 *   1. captures the real built client.js through a fake window.__ModuleLoader__;
 *   2. materializes the captured factory with a require() shim backed by the
 *      local React UMD globals;
 *   3. calls apply() with a fake cordis scope whose only services are the ones
 *      the panel declares: sessions (fake native projection) and slots
 *      (conversation.view) plus uiWorkspace;
 *   4. mounts the component registered on conversation.view into #harness-root,
 *      passing the same props the host would inject.
 *
 * URL parameters (scripts/shoot.mjs drives these):
 *   state=overview|bundled|expanded|new-task|spawn|member|empty|failure
 *   client=<url>   override the client.js URL (default ../client.js)
 *   badge=0        hide the harness status strip
 *
 * Nothing here copies or depends on another panel implementation.
 * The panel under test is only ever fed fabricated native wire values.
 */

import {
  DEFAULT_STATE,
  STATES,
  createFixture,
  createSessionsService,
  describeFixture,
} from './fixtures.mjs';

/** Registration id the browser half must use (=== package.json name). */
export const EXPECTED_MODULE_ID = 'dsh-plugin-agent-team-panel';

export const DEFAULT_CLIENT_URL = new URL('../client.js', import.meta.url).href;

export const VENDOR_HINT = 'demo/vendor/react.production.min.js + demo/vendor/react-dom.production.min.js (React 18.3.1 UMD)';

/** Strict-ish query parsing; unknown states fall back to overview and say so. */
export function parseDemoQuery(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : '');
  const requested = params.get('state') || '';
  const known = STATES.indexOf(requested) !== -1;
  const client = params.get('client');
  return {
    requestedState: requested,
    unknownState: requested.length > 0 && !known,
    state: known ? requested : DEFAULT_STATE,
    clientUrl: client && client.length > 0 ? client : null,
    badge: params.get('badge') !== '0',
  };
}

/**
 * Install a fake module loader that records every registration instead of
 * instantiating it. Supports the object form the DSH web boot uses and a
 * defensive (id, factory) form.
 */
export function createLoaderCapture(target) {
  const registrations = [];
  function record(entry, factory) {
    let normalized = entry;
    if (typeof entry === 'string') normalized = { id: entry, factory };
    if (!normalized || typeof normalized !== 'object') throw new Error('module loader: registration must be an object');
    registrations.push({ id: normalized.id === undefined ? null : normalized.id, factory: normalized.factory });
    return normalized.id === undefined ? null : normalized.id;
  }
  const loader = {
    load(entry, factory) { return record(entry, factory); },
    define(entry, factory) { return record(entry, factory); },
    register(entry, factory) { return record(entry, factory); },
  };
  target.__ModuleLoader__ = loader;
  return { loader, registrations };
}

/** Prefer the id this package is supposed to register; fall back to the only entry. */
export function pickRegistration(registrations, expectedId) {
  const wanted = expectedId || EXPECTED_MODULE_ID;
  const exact = registrations.filter(function (item) { return item.id === wanted; });
  if (exact.length > 0) return exact[exact.length - 1];
  if (registrations.length === 1) return registrations[0];
  return null;
}

/**
 * Run the captured factory with a require() shim. Anything other than react
 * modules is rejected loudly instead of silently returning undefined.
 */
export function materialize(registration, options) {
  if (!registration || typeof registration.factory !== 'function') {
    return { ok: false, error: 'captured registration has no factory' };
  }
  const React = options.React;
  const ReactDOM = options.ReactDOM;
  const requireShim = function (id) {
    if (id === 'react') return React;
    if (id === 'react-dom' || id === 'react-dom/client') return ReactDOM;
    throw new Error('demo harness: the client half required an unsupported module: ' + String(id));
  };
  try {
    const exported = registration.factory(requireShim);
    return { ok: true, id: registration.id, exports: exported };
  } catch (error) {
    return { ok: false, id: registration.id, error: 'factory threw: ' + String((error && error.message) || error) };
  }
}

/** The fake cordis scope: only the declared services exist, everything is recorded. */
export function createHarnessContext(options) {
  const records = options.records;
  const sessions = options.sessions;
  const workspace = options.workspace || null;

  function record(entry) {
    records.push(entry);
    return entry;
  }

  const slots = {
    inject(name, factory) {
      const value = typeof factory === 'function' ? factory() : factory;
      record({ kind: 'slot-inject', name, value });
      return value;
    },
    register(descriptor, Component) {
      const registration = {
        name: descriptor && descriptor.name,
        id: descriptor && descriptor.id,
        order: descriptor && descriptor.order,
        label: descriptor && typeof descriptor.label === 'function' ? descriptor.label() : null,
        descriptor,
        Component,
      };
      record({ kind: 'slot-register', registration });
      return registration;
    },
  };

  const uiWorkspace = workspace || {
    openSession(target) {
      record({ kind: 'open-session', target });
      return target;
    },
  };

  const ctx = {
    sessions,
    slots,
    uiWorkspace,
    effect(callback) {
      const disposer = typeof callback === 'function' ? callback() : null;
      record({ kind: 'effect' });
      return typeof disposer === 'function' ? disposer : function noop() {};
    },
  };

  return Object.freeze({
    ctx,
    slots,
    records,
    sessionCount() { return records.filter(function (item) { return item.kind === 'slot-register'; }).length; },
  });
}

/** The conversation.view registration, if the client half made one. */
export function findViewRegistration(records) {
  const registered = records.filter(function (item) { return item.kind === 'slot-register'; });
  if (registered.length === 0) return null;
  const named = registered.filter(function (item) {
    const name = item.registration && item.registration.name;
    return typeof name === 'string' && name.indexOf('conversation.view') === 0;
  });
  if (named.length > 0) return named[named.length - 1].registration;
  return registered[registered.length - 1].registration;
}

/**
 * Mount the registered component the way the native slot host does: descriptor
 * inject(sessionId) builds the props, the harness adds initialState.
 */
export function mountRegisteredView(options) {
  const React = options.React;
  const ReactDOM = options.ReactDOM;
  const registration = options.record;
  const sessionId = options.sessionId;
  const descriptor = (registration && registration.descriptor) || {};
  const injected = typeof descriptor.inject === 'function' ? descriptor.inject(sessionId) : {};
  const props = Object.assign({}, injected, {
    sessionId,
    sessions: options.sessions,
    initialState: options.initialState || {},
  });
  const Component = registration && registration.Component;
  if (typeof Component !== 'function' && typeof Component !== 'object') {
    throw new Error('conversation.view registration has no component');
  }
  const element = React.createElement(Component, props);
  let root = null;
  if (typeof ReactDOM.createRoot === 'function') {
    root = ReactDOM.createRoot(options.container);
    root.render(element);
  } else if (typeof ReactDOM.render === 'function') {
    ReactDOM.render(element, options.container);
  } else {
    throw new Error('React DOM global exposes neither createRoot nor render');
  }
  return { ok: true, props, component: Component, root };
}

function injectScript(documentRef, url, type) {
  return new Promise(function (resolve) {
    const script = documentRef.createElement('script');
    if (type) script.type = type;
    script.src = url;
    script.async = false;
    script.setAttribute('data-demo-client', type || 'classic');
    script.onload = function () { resolve({ ok: true, type: type || 'classic' }); };
    script.onerror = function () { resolve({ ok: false, type: type || 'classic', error: 'could not load ' + url }); };
    (documentRef.head || documentRef.documentElement).appendChild(script);
  });
}

/**
 * Load the real client half. A built client.js is a classic ModuleLoader
 * script; if it fails to execute, retry once as an ES module (a source-tree
 * client body would need it) and keep both attempts in the report.
 */
export async function loadClientScript(options) {
  const attempts = [];
  attempts.push(await injectScript(options.documentRef, options.url, null));
  if (options.capture.registrations.length === 0) {
    attempts.push(await injectScript(options.documentRef, options.url, 'module'));
  }
  return { ok: options.capture.registrations.length > 0, url: options.url, attempts };
}

function setStatus(documentRef, text) {
  const node = documentRef.getElementById('harness-status');
  if (node) node.textContent = text;
}

function showBanner(documentRef, tone, title, lines) {
  const banner = documentRef.getElementById('harness-banner');
  if (!banner) return;
  banner.setAttribute('data-tone', tone);
  banner.textContent = '';
  const strong = documentRef.createElement('strong');
  strong.textContent = title;
  banner.appendChild(strong);
  for (const line of lines) {
    const item = documentRef.createElement('div');
    item.textContent = line;
    banner.appendChild(item);
  }
  banner.style.display = 'block';
}

function diagnosticCard(documentRef, container, fixture, lines) {
  const card = documentRef.createElement('div');
  card.id = 'harness-diagnostic';
  const heading = documentRef.createElement('h1');
  heading.textContent = 'demo harness 未挂载';
  card.appendChild(heading);
  const summary = documentRef.createElement('p');
  const info = describeFixture(fixture);
  summary.textContent = 'state=' + info.state + ' · members=' + info.members + ' · tasks=' + info.tasks + ' · blockedBy=' + info.edges + ' · goal=' + info.goal;
  card.appendChild(summary);
  const list = documentRef.createElement('ul');
  for (const line of lines) {
    const item = documentRef.createElement('li');
    item.textContent = line;
    list.appendChild(item);
  }
  card.appendChild(list);
  const hint = documentRef.createElement('p');
  hint.textContent = '这个页面只消费构建后的 client.js；源码构建：npm run build（scripts/build-client.mjs）。允许的 URL 参数：state=…, client=…, badge=0。';
  card.appendChild(hint);
  container.appendChild(card);
}

function fail(documentRef, container, result, code, title, lines) {
  result.errors.push({ code, title, lines });
  showBanner(documentRef, 'error', title, lines);
  diagnosticCard(documentRef, container, result.fixture, lines);
  setStatus(documentRef, 'demo harness · ' + code + ' · state=' + result.fixture.state);
  documentRef.documentElement.setAttribute('data-demo-state', result.fixture.state);
  documentRef.body.setAttribute('data-harness-ready', '1');
  return result;
}

/** Full boot: fake data -> capture -> materialize -> apply -> mount. */
export async function boot(options) {
  const documentRef = options.documentRef;
  const windowRef = options.windowRef;
  const container = options.container || documentRef.getElementById('harness-root');
  const location = windowRef.location || { search: '', href: 'http://127.0.0.1/demo/index.html' };
  const parsed = parseDemoQuery(location.search);
  const fixture = createFixture(parsed.state);
  const result = {
    state: fixture.state,
    parsed,
    fixture,
    sessions: createSessionsService(fixture),
    records: [],
    client: null,
    mounted: null,
    errors: [],
    startedAt: new Date().toISOString(),
  };
  windowRef.__DEMO__ = result;

  documentRef.documentElement.setAttribute('data-demo-state', fixture.state);
  documentRef.body.setAttribute('data-badge', parsed.badge ? '1' : '0');
  setStatus(documentRef, 'demo harness · state=' + fixture.state + ' · loading client.js …');

  if (parsed.unknownState) {
    showBanner(documentRef, 'warn', '未知 state 参数，回退到 ' + DEFAULT_STATE, ['requested=' + parsed.requestedState, 'allowed=' + STATES.join(', ')]);
  }

  const React = windowRef.React;
  const ReactDOM = windowRef.ReactDOM;
  if (!React || !ReactDOM) {
    return fail(documentRef, container, result, 'missing-vendor', '缺少本地 React UMD',
      ['把 React 18.3.1 UMD 放到 ' + VENDOR_HINT + '（index.html 已按这个路径引用）', 'window.React=' + String(typeof React) + ' window.ReactDOM=' + String(typeof ReactDOM)]);
  }

  const capture = createLoaderCapture(windowRef);
  const clientUrl = parsed.clientUrl ? new URL(parsed.clientUrl, location.href).href : DEFAULT_CLIENT_URL;
  const loaded = await loadClientScript({ documentRef, windowRef, url: clientUrl, capture });
  result.client = { url: clientUrl, attempts: loaded.attempts, registrations: capture.registrations.map(function (item) { return item.id; }) };

  if (capture.registrations.length === 0) {
    return fail(documentRef, container, result, 'client-not-registered', '没有捕获到 client.js 的模块注册',
      ['URL: ' + clientUrl, '尝试：' + loaded.attempts.map(function (item) { return (item.type || 'classic') + '=' + (item.ok ? 'loaded' : 'failed'); }).join(', '),
        '先构建浏览器半：npm run build（生成仓库根 client.js），再用 scripts/shoot.mjs 或任意静态服务器打开 demo/index.html']);
  }

  const registration = pickRegistration(capture.registrations, EXPECTED_MODULE_ID);
  if (registration === null) {
    return fail(documentRef, container, result, 'module-id-mismatch', '捕获了多个模块，但没有 ' + EXPECTED_MODULE_ID,
      ['捕获到的 id：' + capture.registrations.map(function (item) { return String(item.id); }).join(', ')]);
  }
  result.registrationId = registration.id;

  const materialized = materialize(registration, { React, ReactDOM });
  if (!materialized.ok) {
    return fail(documentRef, container, result, 'materialize-failed', 'client.js factory 执行失败', [String(materialized.error)]);
  }
  result.exports = materialized.exports;

  const context = createHarnessContext({ sessions: result.sessions, records: result.records });
  result.records = context.records;
  if (typeof materialized.exports.apply === 'function') {
    try {
      materialized.exports.apply(context.ctx);
    } catch (error) {
      showBanner(documentRef, 'warn', 'apply() 抛出（已记录，继续尝试挂载）', [String((error && error.message) || error)]);
    }
  } else {
    return fail(documentRef, container, result, 'no-apply', 'client.js 没有导出 apply()', ['导出的键：' + Object.keys(materialized.exports).join(', ')]);
  }

  const viewRecord = findViewRegistration(result.records);
  if (viewRecord === null) {
    return fail(documentRef, container, result, 'slot-not-registered', 'apply() 没有注册 conversation.view',
      ['记录到的 scope 调用：' + result.records.map(function (item) { return item.kind; }).join(', ') || '(none)']);
  }
  result.viewRegistration = { name: viewRecord.name, id: viewRecord.id, order: viewRecord.order, label: viewRecord.label };

  try {
    result.mounted = mountRegisteredView({
      React,
      ReactDOM,
      container,
      record: viewRecord,
      sessions: result.sessions,
      sessionId: fixture.sessionId,
      initialState: fixture.initialState,
    });
  } catch (error) {
    return fail(documentRef, container, result, 'mount-failed', '挂载 conversation.view 组件失败', [String((error && error.message) || error)]);
  }

  const info = describeFixture(fixture);
  setStatus(documentRef, 'demo harness · state=' + info.state + ' · members=' + info.members + ' · tasks=' + info.tasks
    + ' · blockedBy=' + info.edges + ' · goal=' + info.goal
    + ' · 组件=' + result.viewRegistration.id + ' · fake native projection（非生产 DSH 桌面）');
  documentRef.body.setAttribute('data-harness-ready', '1');
  return result;
}

function startBrowser() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.addEventListener('error', function (event) {
    if (window.__DEMO__ && window.__DEMO__.errors) {
      window.__DEMO__.errors.push({ code: 'window-error', title: 'window error', lines: [String(event.message || event.type)] });
    }
  });
  boot({ windowRef: window, documentRef: document }).catch(function (error) {
    const banner = document.getElementById('harness-banner');
    if (banner) {
      banner.style.display = 'block';
      banner.setAttribute('data-tone', 'error');
      banner.textContent = 'demo harness boot 失败：' + String((error && error.stack) || error);
    }
    document.body.setAttribute('data-harness-ready', '1');
  });
}

startBrowser();
