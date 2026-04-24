// Allow all build scripts in this monorepo
function readPackage(pkg) {
  return pkg
}

module.exports = { hooks: { readPackage } }
