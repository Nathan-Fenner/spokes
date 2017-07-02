
let moduleExports = {
    "require": null,
};
function define(moduleName, dependencies, injection) {
    // ignore the module name
    moduleExports.exports = moduleExports[moduleName] = {};
    let args = [];
    for (let dependency of dependencies) {
        args.push(moduleExports[dependency]);
    }
    injection(...args);
    moduleExports.exports = null;
}
