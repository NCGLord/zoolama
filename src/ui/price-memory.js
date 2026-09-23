// What each item cost last time, read from the trip history: rebuilt when the history is drawn (it changes rarely),
// never per keystroke. It feeds the entry form's name suggestions and hint, and the cart lines' price-rise note.

import { pastNames, priceMemory } from '../history.js';
import { $, h } from './dom.js';

let memory = new Map();
let version = 0; // bumps on each rebuild, so line views that show a rise know to redraw

function rememberPrices(trips) {
  memory = priceMemory(trips);
  version++;
  $('item-names').replaceChildren(...pastNames(memory).map((name) => h('option', { value: name })));
}

export { memory, version, rememberPrices };
