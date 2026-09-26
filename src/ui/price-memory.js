// What each item cost last time, read from the trip history: rebuilt whenever the history changes (it changes rarely),
// never per keystroke. It feeds the entry form's name suggestions and hint, and the cart lines' price-rise note, which
// are redrawn with it, so they never cite a trip that's gone, or miss one.

import { pastNames, priceMemory } from '../history.js';
import { $, h } from './dom.js';

let memory = new Map();
let version = 0; // bumps on each rebuild, so line views that show a rise know to redraw

// Told of each rebuild: the cart and the entry form, which read the memory, sit above this module, so boot hands over
// their redraw.
let changed = () => {};

function onPricesChanged(listener) {
  changed = listener;
}

function rememberPrices(trips) {
  memory = priceMemory(trips);
  version++;
  $('item-names').replaceChildren(...pastNames(memory).map((name) => h('option', { value: name })));
  changed();
}

export { memory, version, rememberPrices, onPricesChanged };
