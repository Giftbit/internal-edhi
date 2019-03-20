/*
 * This file sets the log level to DEBUG when referenced.  It should only be referenced
 * from the command line by the mocha runner.
 */

import * as sinon from "sinon";
import * as giftbitRoutes from "giftbit-cassava-routes";
import log = require("loglevel");
import * as logPrefix from "loglevel-plugin-prefix";

const colors = {
    "TRACE": "\u001b[0;32m",    // green
    "DEBUG": "\u001b[0;36m",    // cyan
    "INFO": "\u001b[0;34m",     // blue
    "WARN": "\u001b[0;33m",     // yellow
    "ERROR": "\u001b[0;31m"     // red
};

// Prefix log messages with the level.
logPrefix.reg(log);
logPrefix.apply(log, {
    format: (level, name, timestamp) => {
        return `${colors[level]}[${level}\u001b[0m]`;
    },
});

log.setLevel(log.levels.DEBUG);

sinon.stub(giftbitRoutes.sentry, "sendErrorNotification")
    .callsFake(err => log.error("giftbitRoutes.sentry.sendErrorNotification:", err));
