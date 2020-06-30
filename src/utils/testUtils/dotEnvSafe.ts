import dotEvnSafe = require("dotenv-safe");

try {
    dotEvnSafe.config();
} catch (e) {
    // tslint:disable-next-line:no-console
    console.log(e.toString());
    process.exit(1);
}
