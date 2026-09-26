// Every change to the cart goes through here: saved, then drawn, then any photo nothing points to is cleaned up.

import { cartReducer } from '../cart.js';
import { persist, state } from './app-state.js';
import { collectPhotos } from './photo-cache.js';
import { dropStaleUndo } from './toast.js';

function setCart(cart) {
  persist({ ...state, cart });
  dropStaleUndo();
}

// The cart view draws the cart and also changes it, so it can't be imported here without a cycle: boot hands it over.
let cartRenderer = () => {
  throw new Error('cart renderer not wired');
};

function setCartRenderer(render) {
  cartRenderer = render;
}

function dispatchCart(action) {
  setCart(cartReducer(state.cart, action));
  cartRenderer();
  collectPhotos();
}

export { setCart, dispatchCart, setCartRenderer };
