"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseEventLogs, type Address, type Hash, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { Button } from "@/components/ui/button";
import { confirmedScreeningRecordMatches, HOUSE_SCREENING_DEMO_ABI, screeningSignalLabels, type HouseScreeningDraft } from "@/components/house/house-screening-demo";
import { contractAddresses, hasHouseScreeningDemoAddress } from "@/lib/addresses";
import { mstTestnet } from "@/lib/chains";

type MintState = Readonly<{
  status: "idle" | "wallet" | "receipt" | "confirmed" | "unknown" | "reverted" | "error";
  hash?: Hash;
  tokenId?: bigint;
  message?: string;
}>;

function downloadProof(draft: HouseScreeningDraft, tokenId: bigint) {
  const bundle = {
    schema: "voltgrid.house-screening-demo-proof.v1",
    network: "MST Testnet only (chain 91562037)",
    credentialContract: contractAddresses.houseScreeningDemo,
    tokenId: tokenId.toString(),
    documentCommitment: draft.documentCommitment,
    commitmentRecipe: "SHA-256(commitmentSalt || SHA-256(original file bytes))",
    commitmentSalt: draft.commitmentSalt,
    ocrSignalFlags: draft.signalFlags,
    ocrSignals: screeningSignalLabels(draft.signalFlags),
    claim: "Client-side OCR phrase screening demo only; not an official government, DISCOM, identity, property, installation, or ownership verification.",
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "voltgrid-testnet-screening-proof-" + tokenId.toString() + ".json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function HouseScreeningDemoCredentialPanel({
  houseAddress,
  draft,
  autoMintWhenReady = false,
}: {
  houseAddress?: Address;
  draft?: HouseScreeningDraft;
  autoMintWhenReady?: boolean;
}) {
  const { address, chainId, isConnected } = useAccount();
  const client = usePublicClient({ chainId: mstTestnet.id });
  const { writeContractAsync } = useWriteContract();
  const [tx, setTx] = useState<MintState>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const actionInFlight = useRef(false);
  const autoMintStarted = useRef(false);
  const credentialAddress = contractAddresses.houseScreeningDemo;
  const configured = hasHouseScreeningDemoAddress && Boolean(credentialAddress);
  const eligibleAddress = houseAddress ?? address;
  const tokenQuery = useReadContract({
    address: credentialAddress,
    abi: HOUSE_SCREENING_DEMO_ABI,
    functionName: "credentialTokenOf",
    args: eligibleAddress ? [eligibleAddress] : undefined,
    chainId: mstTestnet.id,
    query: { enabled: configured && Boolean(eligibleAddress) },
  });
  const refetchCredentialToken = tokenQuery.refetch;
  const tokenId = tokenQuery.data ?? BigInt(0);
  const screeningQuery = useReadContract({
    address: credentialAddress,
    abi: HOUSE_SCREENING_DEMO_ABI,
    functionName: "screeningData",
    args: [tokenId],
    chainId: mstTestnet.id,
    query: { enabled: configured && tokenId > BigInt(0) },
  });
  const ownerQuery = useReadContract({
    address: credentialAddress,
    abi: HOUSE_SCREENING_DEMO_ABI,
    functionName: "ownerOf",
    args: [tokenId],
    chainId: mstTestnet.id,
    query: { enabled: configured && tokenId > BigInt(0) },
  });
  const screening = screeningQuery.data;
  const owner = ownerQuery.data;
  const onChainMatch = Boolean(
    screening &&
    draft &&
    screening.documentCommitment.toLowerCase() === draft.documentCommitment.toLowerCase() &&
    Number(screening.signalFlags) === draft.signalFlags,
  );
  const currentWalletOwns = Boolean(address && owner && owner.toLowerCase() === address.toLowerCase());
  const mintMayBeStarted = tx.status === "idle" || tx.status === "error" || tx.status === "reverted";
  const canMint = Boolean(
    draft &&
    houseAddress &&
    address?.toLowerCase() === houseAddress.toLowerCase() &&
    isConnected &&
    chainId === mstTestnet.id &&
    configured &&
    tokenQuery.data === BigInt(0) &&
    !tokenQuery.isLoading &&
    !tokenQuery.isError &&
    client &&
    !busy &&
    mintMayBeStarted,
  );

  const reconcile = useCallback(async (hash: Hash) => {
    if (!client || !credentialAddress || !draft || !houseAddress) {
      setTx({ status: "unknown", hash, message: "The MST Testnet receipt reader is unavailable. Keep this real transaction hash and retry reconciliation when RPC is available." });
      return;
    }
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setTx({ status: "receipt", hash, message: "Checking the MST Testnet receipt and credential state…" });
    try {
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setTx({ status: "reverted", hash, message: "The credential transaction reverted. No screening credential was confirmed." });
        return;
      }
      const parsed = parseEventLogs({
        abi: HOUSE_SCREENING_DEMO_ABI,
        logs: receipt.logs.filter((log) => log.address.toLowerCase() === credentialAddress.toLowerCase()),
        eventName: "HouseScreeningDemoMinted",
        strict: false,
      });
      const event = parsed.find((log) =>
        typeof log.args.account === "string" &&
        typeof log.args.documentCommitment === "string" &&
        typeof log.args.tokenId === "bigint" &&
        log.args.account.toLowerCase() === houseAddress.toLowerCase() &&
        log.args.documentCommitment.toLowerCase() === draft.documentCommitment.toLowerCase() &&
        Number(log.args.signalFlags) === draft.signalFlags,
      );
      if (!event) throw new Error("Successful receipt did not contain the expected screening credential event.");
      const mintedTokenId = event.args.tokenId;
      if (typeof mintedTokenId !== "bigint") throw new Error("Credential mint event did not contain a valid token id.");
      const [actualOwner, actualScreening, actualPointer] = await Promise.all([
        client.readContract({ address: credentialAddress, abi: HOUSE_SCREENING_DEMO_ABI, functionName: "ownerOf", args: [mintedTokenId] }),
        client.readContract({ address: credentialAddress, abi: HOUSE_SCREENING_DEMO_ABI, functionName: "screeningData", args: [mintedTokenId] }),
        client.readContract({ address: credentialAddress, abi: HOUSE_SCREENING_DEMO_ABI, functionName: "credentialTokenOf", args: [houseAddress] }),
      ]);
      if (!confirmedScreeningRecordMatches({
        receiptStatus: receipt.status,
        expectedAccount: houseAddress,
        event: {
          account: event.args.account as Address,
          tokenId: mintedTokenId,
          documentCommitment: event.args.documentCommitment as Hex,
          signalFlags: Number(event.args.signalFlags),
        },
        owner: actualOwner,
        tokenPointer: actualPointer,
        chainData: {
          documentCommitment: actualScreening.documentCommitment,
          signalFlags: Number(actualScreening.signalFlags),
        },
        draft,
      })) throw new Error("Credential receipt succeeded, but the owner, token pointer, or immutable screening data did not match.");
      setTx({ status: "confirmed", hash, tokenId: mintedTokenId, message: "Testnet demo credential confirmed from its receipt, mint event, owner, and immutable on-chain screening record." });
      void refetchCredentialToken();
    } catch (error) {
      setTx({ status: "unknown", hash, message: error instanceof Error ? error.message : "The receipt or on-chain screening state could not be reconciled. No credential is shown as confirmed." });
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }, [client, credentialAddress, draft, houseAddress, refetchCredentialToken]);

  const mint = useCallback(async () => {
    if (!canMint || !draft || !houseAddress || !credentialAddress || actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setTx({ status: "wallet", message: "Review the separate credential mint request in your wallet." });
    try {
      const hash = await writeContractAsync({
        address: credentialAddress,
        abi: HOUSE_SCREENING_DEMO_ABI,
        functionName: "mintDemoScreening",
        args: [draft.documentCommitment, draft.signalFlags],
        chainId: mstTestnet.id,
      });
      actionInFlight.current = false;
      await reconcile(hash);
    } catch (error) {
      actionInFlight.current = false;
      setBusy(false);
      setTx({ status: "error", message: error instanceof Error ? error.message : "Wallet did not submit the credential mint." });
    }
  }, [canMint, credentialAddress, draft, houseAddress, reconcile, writeContractAsync]);

  useEffect(() => {
    if (!autoMintWhenReady || !canMint || autoMintStarted.current) return;
    autoMintStarted.current = true;
    void mint();
  }, [autoMintWhenReady, canMint, mint]);

  const showOwnedRecord = configured && tokenId > BigInt(0) && currentWalletOwns && screening && !screeningQuery.isError;
  return <section className="space-y-3 rounded-xl border border-border bg-background/50 p-4" aria-labelledby="house-screening-demo-title">
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">MST Testnet hackathon demo</p>
      <h2 id="house-screening-demo-title" className="text-lg font-semibold">House bill screening record</h2>
      <p className="text-sm leading-6 text-muted-foreground">This non-transferable token records a wallet-submitted file fingerprint and client-side OCR clue categories. It is not an official government or DISCOM certificate and does not verify identity, ownership, installation, or the bill issuer.</p>
    </div>

    {!configured && <p className="rounded-md border border-border p-3 text-sm" role="status">Testnet demo credential contract is not configured; no mint is available.</p>}
    {autoMintWhenReady && tx.status === "idle" && <p className="rounded-md border border-border p-3 text-sm" role="status" aria-live="polite">Your consented demo mint is being checked. If eligible, your wallet will ask you to approve the real MST Testnet transaction.</p>}
    {configured && !isConnected && <p className="rounded-md border border-border p-3 text-sm" role="status">Connect the wallet used for this house. No wallet or bill data is submitted by this screen.</p>}
    {configured && isConnected && chainId !== mstTestnet.id && <p className="rounded-md border border-border p-3 text-sm" role="status">Switch to MST Testnet ({mstTestnet.id}) to read or mint this demo credential.</p>}
    {configured && tokenQuery.isError && <p className="rounded-md border border-destructive/40 p-3 text-sm" role="alert">MST Testnet could not be read. The credential state is unknown; it is not treated as missing or confirmed.</p>}
    {configured && tokenQuery.isLoading && eligibleAddress && <p className="text-sm text-muted-foreground" role="status">Reading this wallet’s testnet credential…</p>}
    {configured && tokenId > BigInt(0) && (screeningQuery.isLoading || ownerQuery.isLoading) && <p className="text-sm text-muted-foreground" role="status">Checking token ownership and immutable screening data…</p>}
    {configured && tokenId > BigInt(0) && (screeningQuery.isError || ownerQuery.isError) && <p className="rounded-md border border-destructive/40 p-3 text-sm" role="alert">The credential pointer exists, but its owner or immutable data could not be read. It is not shown as confirmed.</p>}
    {configured && tokenId > BigInt(0) && !ownerQuery.isLoading && !ownerQuery.isError && owner && !currentWalletOwns && <p className="rounded-md border border-destructive/40 p-3 text-sm" role="alert">The on-chain credential owner does not match the wallet being checked. No ownership claim is shown.</p>}

    {showOwnedRecord && <div className="space-y-2 rounded-md border border-border p-3" role="status" aria-live="polite">
      <p className="font-semibold">On-chain demo credential · token #{tokenId.toString()}</p>
      <p className="break-all text-xs text-muted-foreground">Document commitment: {screening.documentCommitment}</p>
      <p className="text-sm">OCR clue categories: {screeningSignalLabels(Number(screening.signalFlags)).join(", ") || "none recorded"}</p>
      <p className="text-xs text-muted-foreground">Issued at block time {screening.issuedAt.toString()} (Unix seconds). This records submitted data only, not official verification.</p>
      {credentialAddress && <a className="block break-all text-xs text-primary underline" href={mstTestnet.blockExplorers.default.url + "/address/" + credentialAddress} target="_blank" rel="noreferrer">Open the real credential contract on MSTScan · {credentialAddress}</a>}
    </div>}

    {draft && tokenId > BigInt(0) && screening && !screeningQuery.isLoading && !screeningQuery.isError && !onChainMatch && <p className="rounded-md border border-border p-3 text-sm" role="status">This wallet already has a screening demo token for a different document commitment. The contract allows only one token per wallet; this OCR draft was not issued as a new credential.</p>}
    {draft && houseAddress && address?.toLowerCase() !== houseAddress.toLowerCase() && <p className="rounded-md border border-border p-3 text-sm" role="status">Reconnect the wallet that completed house registration before minting. The credential can only be issued to that wallet.</p>}
    {draft && isConnected && address?.toLowerCase() === houseAddress?.toLowerCase() && tokenQuery.data === BigInt(0) && tx.status !== "confirmed" && <div className="space-y-2">
      {!configured ? null : tx.status === "unknown" && tx.hash
        ? <p className="rounded-md border border-border p-3 text-sm" role="status">This mint has an unresolved transaction hash. Reconcile it before starting another mint to avoid duplicate wallet transactions.</p>
        : <Button type="button" onClick={() => void mint()} disabled={!canMint}>
          {tx.status === "wallet" ? "Review mint in wallet…" : tx.status === "receipt" ? "Checking receipt…" : tx.status === "reverted" ? "Retry demo credential mint" : chainId === mstTestnet.id ? "Mint testnet screening demo credential" : "Switch to MST Testnet"}
        </Button>}
      <p className="text-xs leading-5 text-muted-foreground">Minting is a separate wallet-signed testnet transaction after house registration has a confirmed receipt. Only the salted fingerprint and matched clue flags are recorded on-chain.</p>
    </div>}

    {tx.status !== "idle" && <div className="space-y-2 rounded-md border border-border p-3" role={tx.status === "error" || tx.status === "reverted" ? "alert" : "status"} aria-live="polite">
      <p className="text-sm">{tx.message}</p>
      {tx.hash && <a className="block break-all text-xs text-primary underline" href={mstTestnet.blockExplorers.default.url + "/tx/" + tx.hash} target="_blank" rel="noreferrer">{tx.status === "confirmed" ? "Confirmed mint receipt" : "Real submitted mint transaction"} · {tx.hash}</a>}
      {tx.status === "confirmed" && draft && tx.tokenId && <Button type="button" size="sm" variant="outline" onClick={() => downloadProof(draft, tx.tokenId!)}>Download private proof bundle</Button>}
      {tx.status === "unknown" && tx.hash && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void reconcile(tx.hash!)}>Reconcile this receipt</Button>}
    </div>}

    {configured && isConnected && address && tokenId === BigInt(0) && !draft && !tokenQuery.isLoading && !tokenQuery.isError && <p className="text-sm text-muted-foreground">This wallet has no screening demo credential. A credential can only be minted after a solar house declaration is registered and at least one bill clue passes the local demo screening rule.</p>}
  </section>;
}
