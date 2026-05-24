/**
 * Browser runtime — served as a virtual Vite module (/@sem-edit/overlay).
 *
 * Responsibilities:
 *  1. Toggle overlay mode via keyboard shortcut
 *  2. Highlight hovered elements (outline — no layout shift)
 *  3. On click: resolve element via Preact vnode internals + __source props
 *  4. Collect runtime context (text, styles, bbox, ancestors)
 *  5. Show inspector panel with ranked edit surfaces
 *  6. Accept user instruction and send edit request to dev server
 *  7. Receive patch results and show verification outcome
 *
 * This file is a template string of JavaScript (not TypeScript) so it can be
 * served directly from the plugin's load() hook without a separate build step.
 * The virtual module CAN use ES import syntax — Vite resolves it at serve time.
 */

export type Framework = 'react' | 'preact' | 'unknown'

export function getBrowserRuntime(shortcut: string, framework: Framework): string {
  return /* javascript */`
// sem-edit browser overlay — injected by @sem-edit/vite-plugin in dev mode
// Detected framework: ${framework}

// ─── Element resolution ──────────────────────────────────────────────────────
// Strategy depends on the detected framework.
// React  → __reactFiber$xxx property on DOM nodes + fiber._debugSource
// Preact → options.diffed hook + WeakMap<Element, stack[]>

${framework === 'react' ? `
// React: fibers live on DOM nodes as __reactFiber$<randomkey>
function getReactFiber(el) {
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')) {
      return el[key];
    }
  }
  return null;
}

// Parse a source location from React's _debugStack Error object (newer @vitejs/plugin-react).
// Stack frames look like:
//   at PricingPage (http://localhost:5173/src/pages/PricingPage.tsx:66:81)
//   at http://localhost:5173/src/pages/PricingPage.tsx:67:33
function parseSourceFromDebugStack(err) {
  if (!err?.stack) return null;
  // V8 frame: "    at [name] (url:line:col)" or "    at url:line:col"
  const frameRe = /^\\s+at\\s+(?:.*\\s+\\()?(.+?):(\\d+):(\\d+)\\)?$/;
  for (const line of err.stack.split('\\n')) {
    const m = line.match(frameRe);
    if (!m) continue;
    const raw = m[1];
    // Skip vite/react internals
    if (/node_modules|\\/deps\\/|react_jsx-dev-runtime|react-dom/.test(raw)) continue;
    // Only user source files
    if (!/\\.(tsx?|jsx?)(\\?|$)/.test(raw)) continue;
    let fileName = raw;
    try { fileName = new URL(raw).pathname; } catch {}
    return { fileName, lineNumber: Number(m[2]), columnNumber: Number(m[3]) };
  }
  return null;
}

function resolveStack(target) {
  let fiber = getReactFiber(target);
  // Walk up the DOM tree if no fiber found directly on target
  if (!fiber) {
    let node = target.parentElement;
    while (node && !fiber) {
      fiber = getReactFiber(node);
      node = node.parentElement;
    }
  }
  if (!fiber) return [];
  const stack = [];
  let f = fiber;
  while (f) {
    if (typeof f.type === 'function') {
      const name = f.type.displayName || f.type.name || '';
      if (name && /^[A-Z]/.test(name)) {
        // _debugSource is set by older React/Babel setups; newer @vitejs/plugin-react
        // injects __source as a prop instead (via @babel/plugin-transform-react-jsx-source)
        console.debug('[sem-edit] resolving component stack frame for', name, { ...f }, f._debugStack);
        const src = f._debugSource
          ?? f.pendingProps?.__source
          ?? f.memoizedProps?.__source
          ?? parseSourceFromDebugStack(f._debugStack)
          ?? null;
        const source = src
          ? { fileName: src.fileName, lineNumber: src.lineNumber, columnNumber: src.columnNumber }
          : null;
        stack.push({ name, source });
      }
    }
    f = f.return;
  }
  return stack;
}
` : `
// Preact: hook into options.diffed to map DOM elements → component stacks.
// @preact/preset-vite injects __source props which appear on vnode.props.__source.
import { options } from 'preact';

const elementToStack = new WeakMap();

function buildPreactStack(vnode) {
  const stack = [];
  let current = vnode;
  while (current) {
    if (typeof current.type === 'function') {
      const name = current.type.displayName || current.type.name || '';
      if (name && /^[A-Z]/.test(name)) {
        const src = current?.__source ?? current?.props?.__source ?? null;
        const source = src
          ? { fileName: src.fileName, lineNumber: src.lineNumber, columnNumber: src.columnNumber }
          : null;
        stack.push({ name, source });
      }
    }
    current = current.__; // Preact 10.x parent vnode pointer
  }
  return stack;
}

const _prevDiffed = options.diffed;
options.diffed = function(vnode) {
  if (_prevDiffed) _prevDiffed(vnode);
  if (typeof vnode.type !== 'function') return;
  const el = vnode.__e;
  if (!(el instanceof Element)) return;
  const stack = buildPreactStack(vnode);
  if (stack.length > 0) elementToStack.set(el, stack);
};

function resolveStack(target) {
  let el = target;
  while (el) {
    const stack = elementToStack.get(el);
    if (stack?.length) return stack;
    el = el.parentElement;
  }
  return [];
}
`}

// ─── Runtime context collection ─────────────────────────────────────────────

function getComputedStyleSummary(el) {
  const cs = window.getComputedStyle(el);
  return {
    color:           cs.color,
    backgroundColor: cs.backgroundColor,
    fontSize:        cs.fontSize,
    fontWeight:      cs.fontWeight,
    display:         cs.display,
    position:        cs.position,
    padding:         cs.padding,
    margin:          cs.margin,
    borderRadius:    cs.borderRadius,
  };
}

function getAncestorTags(el, limit = 5) {
  const tags = [];
  let node = el.parentElement;
  while (node && tags.length < limit) {
    const cls = node.className && typeof node.className === 'string'
      ? '.' + node.className.trim().split(/\\s+/).join('.')
      : '';
    tags.push(node.tagName.toLowerCase() + cls);
    node = node.parentElement;
  }
  return tags;
}

function getListContext(el) {
  const parent = el.parentElement;
  if (!parent) return null;
  const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
  if (siblings.length < 2) return null;
  return {
    isListItem: true,
    indexInList: siblings.indexOf(el),
    totalItems: siblings.length,
  };
}

function getAttributes(el) {
  const attrs = {};
  for (const attr of el.attributes) {
    // Redact sensitive attribute values
    if (/password|token|key|secret|auth|credential/i.test(attr.name)) {
      attrs[attr.name] = '[redacted]';
    } else {
      attrs[attr.name] = attr.value;
    }
  }
  return attrs;
}

function collectRuntimeContext(el) {
  const bbox = el.getBoundingClientRect();
  return {
    tagName: el.tagName.toLowerCase(),
    visibleText: (el.innerText || el.textContent || '').trim().slice(0, 500),
    attributes: getAttributes(el),
    computedStyleSummary: getComputedStyleSummary(el),
    boundingBox: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height },
    ancestorTags: getAncestorTags(el),
    listContext: getListContext(el),
  };
}

// ─── Inspector panel UI ──────────────────────────────────────────────────────

let panel = null;
let pendingSelectionId = null;

function createPanel() {
  const el = document.createElement('div');
  el.id = 'sem-edit-panel';
  el.style.cssText = [
    'position:fixed',
    'bottom:16px',
    'right:16px',
    'width:360px',
    'background:#18181b',
    'color:#e4e4e7',
    'border:1px solid #3f3f46',
    'border-radius:8px',
    'font:13px/1.5 "SF Mono",ui-monospace,monospace',
    'z-index:2147483647',
    'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
    'padding:12px',
    'display:none',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

function renderPanel(context) {
  if (!panel) panel = createPanel();
  const { componentStack, surfaces, listWarning } = context;

  const topComponent = componentStack[0];
  const sourceFile = topComponent?.source?.fileName
    ? topComponent.source.fileName.replace(/.*\\/src\\//, 'src/')
    : '?';

  const surfaceRows = (surfaces || []).map(s => {
    const conf = Math.round(s.confidence * 100);
    const bar = '█'.repeat(Math.round(conf / 10)) + '░'.repeat(10 - Math.round(conf / 10));
    const shortFile = s.file.replace(/.*\\/src\\//, 'src/');
    return \`
      <div style="margin:4px 0;padding:6px;background:#27272a;border-radius:4px">
        <span style="color:#a78bfa">[\${s.type}]</span>
        <span style="color:#fafafa;margin-left:4px">\${shortFile}</span>
        \${s.symbol ? \`<span style="color:#6ee7b7"> \${s.symbol}</span>\` : ''}
        <br>
        <span style="color:#71717a;font-size:11px">\${conf}% \${bar} \${s.reason.slice(0, 60)}</span>
      </div>\`;
  }).join('');

  panel.innerHTML = \`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="color:#a78bfa;font-weight:600">sem-edit</span>
      <button id="sem-edit-close" style="background:none;border:none;color:#71717a;cursor:pointer;font-size:16px">×</button>
    </div>
    <div style="color:#71717a;margin-bottom:6px">
      Selected: <span style="color:#fafafa">\${topComponent?.name ?? '?'}</span>
      <span style="color:#52525b"> (\${sourceFile})</span>
    </div>
    \${listWarning ? \`<div style="color:#fbbf24;margin-bottom:6px;font-size:11px">⚠ List item — editing affects all \${listWarning} items</div>\` : ''}
    <div style="margin-bottom:8px"><strong style="color:#71717a;font-size:11px">EDIT SURFACES</strong></div>
    \${surfaceRows || '<div style="color:#52525b;font-size:12px">No surfaces resolved — graph may still be building.</div>'}
    <div style="margin-top:10px">
      <input id="sem-edit-instruction"
        placeholder="e.g. make the button text bold"
        style="width:100%;box-sizing:border-box;background:#27272a;border:1px solid #3f3f46;
               border-radius:4px;color:#fafafa;font:13px ui-monospace,monospace;padding:6px 8px;
               outline:none"
      />
      <div style="display:flex;gap:6px;margin-top:6px">
        <button id="sem-edit-copy-json"
          style="flex:1;background:#27272a;border:1px solid #3f3f46;border-radius:4px;
                 color:#a1a1aa;font:12px ui-monospace,monospace;padding:5px;cursor:pointer">
          Copy JSON
        </button>
        <button id="sem-edit-copy-prompt"
          style="flex:1;background:#27272a;border:1px solid #3f3f46;border-radius:4px;
                 color:#a1a1aa;font:12px ui-monospace,monospace;padding:5px;cursor:pointer">
          Copy Prompt
        </button>
      </div>
    </div>
    <div id="sem-edit-status" style="margin-top:6px;font-size:11px;color:#71717a"></div>
  \`;

  panel.style.display = 'block';

  panel.querySelector('#sem-edit-close').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  function requestBundle(instruction) {
    if (!pendingSelectionId) return;
    if (import.meta.hot) {
      import.meta.hot.send('sem-edit:build-bundle', {
        selectionId: pendingSelectionId,
        instruction,
      });
    }
  }

  panel.querySelector('#sem-edit-copy-json').addEventListener('click', () => {
    const instruction = panel.querySelector('#sem-edit-instruction').value.trim();
    requestBundle(instruction);
    setStatus('Building bundle…');
  });

  panel.querySelector('#sem-edit-copy-prompt').addEventListener('click', () => {
    const instruction = panel.querySelector('#sem-edit-instruction').value.trim();
    requestBundle(instruction);
    setStatus('Building prompt…');
    // Flag: user wants the full prompt, not just JSON
    panel.dataset.copyMode = 'prompt';
  });

  panel.querySelector('#sem-edit-instruction').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      requestBundle(e.target.value.trim());
      setStatus('Building bundle…');
    }
  });
}

function setStatus(msg, color = '#71717a') {
  const el = panel?.querySelector('#sem-edit-status');
  if (el) { el.textContent = msg; el.style.color = color; }
}

// ─── Overlay ─────────────────────────────────────────────────────────────────

let overlayActive = false;
let highlighted = null;

function setHighlight(el) {
  if (highlighted && highlighted !== el) clearHighlight();
  if (!el) return;
  el.style.setProperty('outline', '2px dashed #6366f1', 'important');
  el.style.setProperty('outline-offset', '2px', 'important');
  highlighted = el;
}

function clearHighlight() {
  if (!highlighted) return;
  highlighted.style.removeProperty('outline');
  highlighted.style.removeProperty('outline-offset');
  highlighted = null;
}

function enableOverlay() {
  overlayActive = true;
  document.body.style.cursor = 'crosshair';
  document.addEventListener('mousemove', onHover, { capture: true, passive: true });
  document.addEventListener('click', onClick, { capture: true });
  document.addEventListener('keydown', onKeyDown);
}

function disableOverlay() {
  overlayActive = false;
  document.body.style.cursor = '';
  document.removeEventListener('mousemove', onHover, { capture: true });
  document.removeEventListener('click', onClick, { capture: true });
  clearHighlight();
}

function onHover(e) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (target.id === 'sem-edit-panel' || target.closest('#sem-edit-panel')) return;
  setHighlight(target);
}

function onClick(e) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (target.id === 'sem-edit-panel' || target.closest('#sem-edit-panel')) return;

  e.preventDefault();
  e.stopPropagation();
  clearHighlight();
  disableOverlay();

  const stack = resolveStack(target);
  const context = collectRuntimeContext(target);
  const selectionId = Math.random().toString(36).slice(2);
  pendingSelectionId = selectionId;

  const payload = {
    selectionId,
    timestamp: Date.now(),
    componentStack: stack,
    elementInfo: context,
  };

  // Show panel with placeholder while we wait for server response
  renderPanel({
    componentStack: stack,
    surfaces: null,
    listWarning: context.listContext?.totalItems > 1 ? context.listContext.totalItems : null,
  });

  if (import.meta.hot) {
    import.meta.hot.send('sem-edit:selection', payload);
  }
}

function onKeyDown(e) {
  if (e.key === 'Escape') disableOverlay();
}

// ─── Keyboard shortcut ───────────────────────────────────────────────────────

const isMac = /mac/i.test(navigator.platform || navigator.userAgent);
const SHORTCUT = ${JSON.stringify(shortcut.toLowerCase())};

// Render the shortcut string as platform-appropriate symbols for display.
function formatShortcut(s) {
  const MAC_SYMBOLS = { ctrl: '⌃', meta: '⌘', shift: '⇧', alt: '⌥' };
  const WIN_LABELS  = { ctrl: 'Ctrl', meta: 'Win', shift: 'Shift', alt: 'Alt' };
  return s.split('+').map(part => {
    if (isMac) return MAC_SYMBOLS[part] ?? part.toUpperCase();
    const label = WIN_LABELS[part] ?? part.toUpperCase();
    // Wrap modifiers in a consistent label; leave the bare key as-is
    return WIN_LABELS[part] ? label : part.toUpperCase();
  }).join(isMac ? '' : '+');
}

document.addEventListener('keydown', (e) => {
  const combo = [
    e.ctrlKey  && 'ctrl',
    e.metaKey  && 'meta',
    e.shiftKey && 'shift',
    e.altKey   && 'alt',
    e.key.toLowerCase(),
  ].filter(Boolean).join('+');

  if (combo === SHORTCUT) {
    e.preventDefault();
    if (overlayActive) {
      disableOverlay();
    } else {
      enableOverlay();
    }
  }
});

// ─── Dev server message handlers ─────────────────────────────────────────────

if (import.meta.hot) {
  // Server resolved the owner graph and ranked surfaces
  import.meta.hot.on('sem-edit:context', (data) => {
    if (data.selectionId !== pendingSelectionId) return;
    renderPanel({
      componentStack: data.componentStack || [],
      surfaces: data.rankedSurfaces || [],
      listWarning: null,
    });
  });

  import.meta.hot.on('sem-edit:bundle', (data) => {
    if (data.selectionId !== pendingSelectionId) return;

    if (data.error) {
      if (panel) delete panel.dataset.copyMode;
      setStatus('Error: ' + data.error, '#f87171');
      return;
    }

    const copyMode = panel?.dataset.copyMode ?? 'json';
    if (panel) delete panel.dataset.copyMode;
    const text = copyMode === 'prompt'
      ? data.fullPrompt
      : JSON.stringify(data.bundle, null, 2);

    navigator.clipboard.writeText(text).then(() => {
      setStatus(copyMode === 'prompt' ? '✓ Full prompt copied to clipboard' : '✓ JSON bundle copied to clipboard', '#6ee7b7');
    }).catch(() => {
      // Fallback: show in a textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setStatus('✓ Copied to clipboard', '#6ee7b7');
    });
  });
}

// ─── Activation toast ────────────────────────────────────────────────────────

(function showActivationHint() {
  const toast = document.createElement('div');
  toast.innerHTML = [
    '<span style="color:#c4b5fd;font-weight:600;font-size:13px">sem-edit</span>',
    '<span style="color:#e4e4e7;font-size:13px"> ready</span>',
    '<br>',
    '<span style="color:#a1a1aa;font-size:12px">Press </span>',
    '<kbd style="background:#3f3f46;color:#a78bfa;border:1px solid #52525b;border-radius:4px;',
               'padding:1px 6px;font:12px/1.6 \\'SF Mono\\',ui-monospace,monospace">' + formatShortcut(SHORTCUT) + '</kbd>',
    '<span style="color:#a1a1aa;font-size:12px"> to inspect elements</span>',
  ].join('');
  toast.style.cssText = [
    'position:fixed',
    'top:16px',
    'right:16px',
    'transform:translateX(calc(100% + 16px))',
    'background:#1c1917',
    'border:1px solid #a78bfa',
    'border-radius:8px',
    'font-family:"SF Mono",ui-monospace,monospace',
    'line-height:1.6',
    'padding:10px 16px',
    'z-index:2147483646',
    'pointer-events:none',
    'box-shadow:0 4px 20px rgba(167,139,250,0.25)',
    'transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.4s ease',
  ].join(';');
  document.body.appendChild(toast);
  // Slide in on next frame
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
  });
  // Fade out after 4 s, remove after transition
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(calc(100% + 16px))'; }, 4000);
  setTimeout(() => { toast.remove(); }, 4500);
})();
`
}
