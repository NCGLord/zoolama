// Zoom for the magnifier (lupa). A phone lens can't focus closer than about 10 cm, so small print is read from a
// step back, zoomed in. Where the camera zooms (Chrome on Android), its own range is used; where it doesn't, the
// picture is enlarged on screen instead, which a high-resolution stream keeps readable up to DIGITAL_MAX.

export const DIGITAL_MAX = 4;
const DEFAULT_STEP = 0.1;

/** The zoom range for a camera track's getCapabilities() result; `hardware` says whether the camera does it. */
export function zoomRange(caps) {
  const zoom = caps?.zoom;
  if (zoom && zoom.max > zoom.min) {
    return { min: zoom.min, max: zoom.max, step: zoom.step > 0 ? zoom.step : DEFAULT_STEP, hardware: true };
  }
  return { min: 1, max: DIGITAL_MAX, step: DEFAULT_STEP, hardware: false };
}

/** `value` inside the range, on its step grid counted from `min` (max always counts, even off the grid). */
export function clampZoom(value, { min, max, step }) {
  const inside = Math.min(max, Math.max(min, value));
  const snapped = Number((min + Math.round((inside - min) / step) * step).toFixed(6)); // toFixed: 2.5, not 2.5000000000000004
  return Math.min(max, snapped);
}

/** The zoom after a pinch: the one it started at, scaled by how far the fingers spread since. */
export function pinchZoom(startZoom, startGap, gap, range) {
  return startGap > 0 ? clampZoom((startZoom * gap) / startGap, range) : startZoom;
}

/** Whether the camera has a torch: Chrome reports `torch: true`; the spec now reports a list, `[false, true]`. */
export function hasTorch(caps) {
  const torch = caps?.torch;
  return torch === true || (Array.isArray(torch) && torch.includes(true));
}
