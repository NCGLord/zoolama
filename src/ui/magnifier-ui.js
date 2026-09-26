// The magnifier (lupa): the back camera, live and full screen, for reading small print such as a best-before date.
// Nothing is recorded or kept. The camera runs only while the magnifier is open and the app is in front: closing it
// (Fechar, Esc, the back gesture) or leaving the app turns it off, and coming back turns it on at the same zoom.

import { formatZoom } from '../i18n.js';
import { clampZoom, pinchZoom, zoomRange } from '../magnifier.js';
import { state } from './app-state.js';
import { $ } from './dom.js';
import { tr } from './text.js';

const dialog = $('magnifier');
const video = $('magnifier-video');
const slider = $('magnifier-zoom');
const torchBtn = $('magnifier-torch');
const freezeBtn = $('magnifier-freeze');

// A high-resolution picture keeps small print sharp when it has to be enlarged on screen. zoom: true asks for leave
// to zoom along with the camera itself; browsers that don't know it ignore it.
const CAMERA = { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, zoom: true };

let stream = null;
let track = null;
let focus = false; // whether the camera offers continuous autofocus
let torch = false; // whether it has a torch
let torchOn = false;
let frozen = false;
let range = zoomRange();
let zoom = 1;
let session = 0; // bumped by every start and stop, so a camera that opens after the magnifier closed is shut at once

$('magnifier-btn').hidden = !navigator.mediaDevices?.getUserMedia;

function showMessage(key) {
  $('magnifier-msg').hidden = !key;
  $('magnifier-msg').textContent = key ? tr(key) : '';
}

function renderZoom() {
  Object.assign(slider, { min: range.min, max: range.max, step: range.step, value: zoom });
  const label = formatZoom(zoom, state.lang);
  $('magnifier-level').textContent = label;
  slider.setAttribute('aria-valuetext', label);
  if (range.hardware) video.style.removeProperty('--zoom');
  else video.style.setProperty('--zoom', zoom); // through the CSSOM: the CSP forbids style attributes
}

/* ---------- camera settings ---------- */

// applyConstraints is async and a pinch asks for a new zoom every frame, so the camera gets one change at a time:
// whatever is wanted by the time the last one lands. Each change carries every setting, since a new set of
// constraints replaces the old one.
let changed = false;
let applying = false;

const settings = () => ({
  ...(focus ? { focusMode: 'continuous' } : {}),
  ...(range.hardware ? { zoom } : {}),
  ...(torch ? { torch: torchOn } : {}),
});

async function applySettings() {
  changed = true;
  if (applying) return;
  applying = true;
  while (changed && track) {
    changed = false;
    await track.applyConstraints({ advanced: [settings()] }).catch(() => {});
  }
  applying = false;
}

function setZoom(value) {
  zoom = clampZoom(value, range);
  renderZoom();
  if (range.hardware) applySettings();
}

/* ---------- camera on and off ---------- */

// Freezing holds the last frame still, to read it without the shake that high zoom magnifies. Zoom waits meanwhile:
// on a camera that zooms, it would change nothing on screen until the picture moves again.
function setFrozen(on) {
  frozen = on;
  freezeBtn.setAttribute('aria-pressed', String(on));
  freezeBtn.disabled = !stream;
  slider.disabled = on || !stream;
  if (on) video.pause();
  else if (stream) video.play().catch(() => {});
}

async function start() {
  const mine = ++session;
  showMessage(null);
  let opened;
  try {
    opened = await navigator.mediaDevices.getUserMedia({ video: CAMERA });
  } catch (e) {
    if (mine === session) showMessage(e.name === 'NotAllowedError' ? 'cameraDenied' : 'cameraUnavailable');
    return;
  }
  if (mine !== session) {
    for (const t of opened.getTracks()) t.stop();
    return;
  }
  stream = opened;
  [track] = opened.getVideoTracks();
  video.srcObject = opened;
  const caps = track.getCapabilities?.() ?? {};
  range = zoomRange(caps);
  focus = Boolean(caps.focusMode?.includes('continuous'));
  torch = caps.torch === true;
  torchBtn.hidden = !torch;
  setFrozen(false);
  zoom = clampZoom(zoom, range);
  renderZoom();
  applySettings();
}

function stop() {
  session++;
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = track = null;
  video.srcObject = null;
  setFrozen(false); // a new picture after leaving the app, or on the next opening
}

function openMagnifier() {
  if (dialog.open) return;
  zoom = 1;
  renderZoom();
  torchOn = false; // each opening starts with the torch off; leaving the app and coming back keeps it as it was
  torchBtn.setAttribute('aria-pressed', 'false');
  torchBtn.hidden = true; // until the camera says it has one
  dialog.showModal();
  start();
}

$('magnifier-btn').addEventListener('click', openMagnifier);
dialog.addEventListener('close', stop);

document.addEventListener('visibilitychange', () => {
  if (!dialog.open) return;
  if (document.visibilityState === 'hidden') stop();
  else start();
});

freezeBtn.addEventListener('click', () => setFrozen(!frozen));

torchBtn.addEventListener('click', () => {
  torchOn = !torchOn;
  torchBtn.setAttribute('aria-pressed', String(torchOn));
  applySettings();
});

/* ---------- zooming ---------- */

slider.addEventListener('input', () => setZoom(Number(slider.value)));

// Two fingers on the picture zoom it by how far they spread, like any camera app.
const view = $('magnifier-view');
const fingers = new Map();
let pinch = null; // the gap and zoom when the second finger went down

const gap = () => {
  const [a, b] = fingers.values();
  return Math.hypot(a.x - b.x, a.y - b.y);
};

view.addEventListener('pointerdown', (e) => {
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  pinch = fingers.size === 2 ? { gap: gap(), zoom } : null;
});

view.addEventListener('pointermove', (e) => {
  if (!fingers.has(e.pointerId)) return;
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!pinch || fingers.size !== 2 || slider.disabled) return;
  const next = pinchZoom(pinch.zoom, pinch.gap, gap(), range);
  if (next !== zoom) setZoom(next);
});

for (const type of ['pointerup', 'pointercancel']) {
  view.addEventListener(type, (e) => {
    fingers.delete(e.pointerId);
    pinch = null;
  });
}
