const path = require("node:path");
const fs = require("node:fs");
const destino = path.resolve(__dirname, "../gerados/blockchain/cobertura");
module.exports = {
  configureYulOptimizer: true,
  istanbulFolder: destino,
  onIstanbulComplete: () => {
    const origem = path.resolve(__dirname, "../../coverage.json");
    if (fs.existsSync(origem)) {
      fs.mkdirSync(destino, { recursive: true });
      fs.renameSync(origem, path.join(destino, "coverage.json"));
    }
  },
};
