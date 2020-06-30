import dotEvnSafe = require("dotenv-safe");

try {
    dotEvnSafe.config();
} catch (e) {
    // eslint-disable-next-line no-console
    console.log(e.toString());
    process.exit(1);
}
