import { expect } from "chai";
import type { Provider, TransactionReceipt } from "ethers";
import { canSkipAppliedAdminAction, getLegacyTestnetGasPrice, waitForTestnetReceipt } from "../scripts/lib/testnetDeployment";

describe("MST Testnet receipt polling", function () {
  it("uses the provider receipt lookup and resumes when a submitted transaction is mined", async function () {
    const receipt = { status: 1, hash: `0x${"11".repeat(32)}` } as TransactionReceipt;
    let calls = 0;
    const provider = {
      getTransactionReceipt: async () => (++calls === 1 ? null : receipt),
    } as unknown as Provider;

    const result = await waitForTestnetReceipt(provider, receipt.hash, "VoltToken", {
      timeoutMs: 1000,
      pollIntervalMs: 1,
    });

    expect(result).to.equal(receipt);
    expect(calls).to.equal(2);
  });

  it("uses the RPC gas price as an explicit legacy fee for testnet writes", async function () {
    const provider = {
      getFeeData: async () => ({ gasPrice: 1_000_000_000n }),
    } as unknown as Provider;

    expect(await getLegacyTestnetGasPrice(provider)).to.equal(1_000_000_000n);
  });

  it("skips a completed earlier action while preserving a later pending action", async function () {
    expect(canSkipAppliedAdminAction("revoke:token.MINTER_ROLE.deployer", "revoke:market.ORACLE_ROLE.deployer", true)).to.equal(true);
    expect(canSkipAppliedAdminAction("revoke:token.MINTER_ROLE.deployer", "revoke:market.ORACLE_ROLE.deployer", false)).to.equal(false);
    expect(canSkipAppliedAdminAction("revoke:token.MINTER_ROLE.deployer", "revoke:token.MINTER_ROLE.deployer", true)).to.equal(false);
  });
});
