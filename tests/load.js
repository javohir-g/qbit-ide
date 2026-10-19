/* Loads the simulator core (no DOM) into Node. The same file list is used by index.html. */
'use strict';
const path = require('path');
const root = path.join(__dirname, '..', 'js');
const files = require('../js/core-files.json');
for (const f of files) require(path.join(root, f));
module.exports = globalThis.QBIT;
