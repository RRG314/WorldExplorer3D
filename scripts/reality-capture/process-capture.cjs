#!/usr/bin/env node
'use strict';
// Compatibility entry point. There is one runtime path: the authenticated,
// capture-scoped broker worker. No broad Admin SDK or fixture publication path.
require('./broker-worker.cjs');
