// The desktop shell requires only Electron and Node builtins. The renderer is
// already bundled, so application node_modules are deliberately handled here.
module.exports = async () => false;
