// The About tab: what zoolama is, its licence, and where its code and its author are. The logo is a copy of the header
// one, so tools/wordmark.py stays its one source; the rest is plain markup in index.html.

import { $ } from './dom.js';

$('about-logo').append(document.querySelector('.brand .wordmark').cloneNode(true));
