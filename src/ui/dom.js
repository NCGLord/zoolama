// DOM helpers every view shares: element lookup and building, focus kept across re-renders, animation replay, and
// whether something is a field being typed in.

const $ = (id) => document.getElementById(id);

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)'); // JS animations check it too; CSS can't reach them

const TEXT_FIELD = 'input:not([type="radio"], [type="checkbox"], [type="file"]), textarea';
const isTextField = (el) => el?.matches?.(TEXT_FIELD) ?? false;

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

/** Makes `parent`'s children exactly `nodes`, in order, removing or moving only the ones that must change. */
function reconcile(parent, nodes) {
  const keep = new Set(nodes);
  for (const child of [...parent.children]) if (!keep.has(child)) child.remove();
  nodes.forEach((node, i) => {
    if (parent.children[i] !== node) parent.insertBefore(node, parent.children[i] ?? null);
  });
}

export { $, reducedMotion, isTextField, h, keepingFocus, icon, replay, reconcile };
