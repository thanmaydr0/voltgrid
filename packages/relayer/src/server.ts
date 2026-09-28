import { AuthManager } from "./auth";
import { EthersChainClient } from "./chain";
import { loadConfig } from "./config";
import { createExpressApp, createNodeServer, RelayerHttpRouter } from "./http";
import { RelayerService } from "./service";
import { JsonRunStore } from "./store";

async function main(): Promise<void> {
  const config = loadConfig();
  const chain = new EthersChainClient(config);
  const store = new JsonRunStore(config.dataPath);
  const auth = new AuthManager(config);
  const service = new RelayerService(config, chain, store, auth);
  await service.init();
  const router = new RelayerHttpRouter(service, config);
  const port = Number(process.env.RELAYER_PORT || 8787);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("RELAYER_PORT must be a valid port");

  let server;
  try {
    const app = createExpressApp(router) as { listen: (port: number, callback: () => void) => { on: (event: string, handler: (error: Error) => void) => void } };
    server = app.listen(port, () => { process.stdout.write(`VoltGrid relayer listening on ${port}\n`); });
    server.on("error", (error) => { process.stderr.write(`Relayer server error: ${error.message}\n`); process.exitCode = 1; });
  } catch (error) {
    if (!(error instanceof Error) || !/Cannot find module 'express'/.test(error.message)) throw error;
    const nodeServer = createNodeServer(router);
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
