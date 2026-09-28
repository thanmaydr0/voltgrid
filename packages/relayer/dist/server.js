"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("./auth");
const chain_1 = require("./chain");
const config_1 = require("./config");
const http_1 = require("./http");
const service_1 = require("./service");
const store_1 = require("./store");
async function main() {
    const config = (0, config_1.loadConfig)();
    const chain = new chain_1.EthersChainClient(config);
    const store = new store_1.JsonRunStore(config.dataPath);
    const auth = new auth_1.AuthManager(config);
    const service = new service_1.RelayerService(config, chain, store, auth);
    await service.init();
    const router = new http_1.RelayerHttpRouter(service, config);
    const port = Number(process.env.RELAYER_PORT || 8787);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
        throw new Error("RELAYER_PORT must be a valid port");
    let server;
    try {
        const app = (0, http_1.createExpressApp)(router);
        server = app.listen(port, () => { process.stdout.write(`VoltGrid relayer listening on ${port}\n`); });
        server.on("error", (error) => { process.stderr.write(`Relayer server error: ${error.message}\n`); process.exitCode = 1; });
    }
    catch (error) {
        if (!(error instanceof Error) || !/Cannot find module 'express'/.test(error.message))
            throw error;
        const nodeServer = (0, http_1.createNodeServer)(router);
        nodeServer.listen(port, () => { process.stdout.write(`VoltGrid relayer listening on ${port}\n`); });
        server = nodeServer;
    }
}
main().catch((error) => {
    // Do not print configuration values or provider error objects: either may
    // contain a secret-bearing connection string or transaction request.
    process.stderr.write(`Relayer failed to start: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
});
