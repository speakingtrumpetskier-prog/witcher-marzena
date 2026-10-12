// Tiny DOM helpers shared by every UI file. No framework: elements are built once and mutated
// only when a value changes, so the HUD never causes layout work per frame.

// h('div', { class: 'x', style: {...}, onClick }, child, 'text', [more children])
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') {
        if (typeof v === 'string') e.style.cssText = v;
        else Object.assign(e.style, v);
      } else if (k === 'html') e.innerHTML = v;
      else if (k.length > 2 && k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  add(e, kids);
  return e;
}

export function add(parent, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(parent, k);
    else if (typeof k === 'string' || typeof k === 'number') parent.appendChild(document.createTextNode(String(k)));
    else parent.appendChild(k);
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// Inline SVG string -> element (icons are static strings from icons.js, never user data).
export function svg(markup, cls) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const n = t.content.firstChild;
  if (cls) n.setAttribute('class', cls);
  return n;
}

// Text with *italic* spans, built with DOM nodes so nothing is ever parsed as HTML.
export function markup(text) {
  const frag = document.createDocumentFragment();
  const parts = String(text ?? '').split('*');
  parts.forEach((p, i) => {
    if (!p) return;
    if (i % 2 === 1) {
      const em = document.createElement('em');
      em.textContent = p;
      frag.appendChild(em);
    } else frag.appendChild(document.createTextNode(p));
  });
  return frag;
}

export function setText(node, text) {
  if (node._t !== text) {
    node._t = text;
    node.textContent = text;
  }
}

export function setStyle(node, prop, value) {
  const key = `_s_${prop}`;
  if (node[key] !== value) {
    node[key] = value;
    node.style[prop] = value;
  }
}

export function toggle(node, cls, on) {
  const key = `_c_${cls}`;
  if (node[key] !== on) {
    node[key] = on;
    node.classList.toggle(cls, on);
  }
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// Safe localStorage (private windows and blocked storage throw).
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
  },
};
