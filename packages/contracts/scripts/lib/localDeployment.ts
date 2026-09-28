import fs from "fs";
import path from "path";

export type LocalContractDeployment = {
  address: string;
  deployTxHash: string;
  blockNumber: string;
  constructorArguments: unknown[];
};

export type LocalDeployment = {
  schemaVersion: 1;
  network: string;
  chainId: string;
  contracts: Record<string, LocalContractDeployment>;
};

export const localDeploymentPath = path.join(__dirname, "..", "..", "deployments", "local.json");

export function writeLocalDeployment(deployment: LocalDeployment): void {
  fs.mkdirSync(path.dirname(localDeploymentPath), { recursive: true });
  fs.writeFileSync(localDeploymentPath, JSON.stringify(deployment, null, 2) + "\n");
}

export function readLocalDeployment(): LocalDeployment {
  if (!fs.existsSync(localDeploymentPath)) {
    throw new Error(`No local deployment found at ${localDeploymentPath}. Run deploy:local first.`);
  }
  return JSON.parse(fs.readFileSync(localDeploymentPath, "utf8")) as LocalDeployment;
}
