// DOM helpers every view shares: element lookup and building, focus kept across re-renders, animation replay.

const $ = (id) => document.getElementById(id);

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)'); // JS animations check it too; CSS can't reach them

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children);
  return el;
}

/** Re-rendering replaces buttons; put focus back on the element with the same data-key. */
function keepingFocus(render) {
  const key = document.activeElement?.dataset?.key;
  render();
  if (key) document.querySelector(`[data-key="${key}"]`)?.focus();
}

const icon = (id) => $(id).content.firstElementChild.cloneNode(true);

/** Restarts a CSS animation on an element, even if it is still running. */
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export { $, reducedMotion, h, keepingFocus, icon, replay };
