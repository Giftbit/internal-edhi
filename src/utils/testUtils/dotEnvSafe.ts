try {
    require("dotenv-safe").config();
} catch (e) {
    // tslint:disable-next-line:no-console
    console.log(e.toString());
    process.exit(1);
}
