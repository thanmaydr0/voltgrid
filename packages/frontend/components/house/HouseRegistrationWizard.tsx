"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type Address, type Hash } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConnectButton } from "@/components/ConnectButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { NetworkWarning } from "@/components/NetworkWarning";
import { HouseScreeningDemoCredentialPanel } from "@/components/house/HouseScreeningDemoCredentialPanel";
import { SolarBillOcrDemo } from "@/components/house/SolarBillOcrDemo";
import type { HouseScreeningDraft } from "@/components/house/house-screening-demo";
import { SolarCertificateEvidenceNotice } from "@/components/house/SolarCertificateEvidenceNotice";
import { mstTestnet } from "@/lib/chains";
import { contractAddresses } from "@/lib/addresses";
import { VOLT_GRID_MARKET_ABI } from "voltgrid-shared";
import {
  declarationMatchesEvent,
  findHouseRegisteredEvent,
  getRegistrationReadiness,
  MAX_BATTERY_CAPACITY_WH,
  MAX_HOUSES,
  normalizeBatteryCapacity,
  parseDaySnapshot,
  parseHouseSnapshot,
  validateDeclaration,
  type HouseDeclaration,
} from "./registration";
import { describeWalletError, errorText, explorerTransactionUrl, reconcileReceipt, transactionIsInFlight } from "@/components/wallet/transaction";

type RegistrationStep = "readiness" | "declaration" | "review" | "sign" | "receipt";
type RegistrationTx = {
  readonly stage: "wallet" | "receipt" | "confirmed" | "unknown" | "reverted" | "error";
  readonly hash?: Hash;
  readonly houseAddress?: Address;
  readonly message?: string;
  readonly technical?: string;
};
type ReceiptLike = {
  readonly status?: string;
  readonly logs: readonly { readonly address: string; readonly data: `0x${string}`; readonly topics: readonly `0x${string}`[] }[];
};

const steps: readonly { key: RegistrationStep; label: string }[] = [
  { key: "readiness", label: "Readiness" },
  { key: "declaration", label: "Declaration" },
  { key: "review", label: "Review" },
  { key: "sign", label: "Wallet sign" },
  { key: "receipt", label: "Receipt" },
];

function CheckRow({ label, ok, unknown, detail }: { label: string; ok: boolean; unknown?: boolean; detail: string }) {
  return <div className="flex items-start gap-3 rounded-md border border-border p-3 text-sm"><span aria-hidden="true" className={ok ? "text-primary" : unknown ? "text-accent" : "text-destructive"}>{ok ? "✓" : unknown ? "?" : "!"}</span><span><strong>{label}</strong><br /><span className="text-muted-foreground">{detail}</span></span></div>;
}

function RegistrationTransaction({ tx, onReconcile }: { tx?: RegistrationTx; onReconcile: () => void }) {
  if (!tx) return null;
  const canReconcile = Boolean(tx.hash && tx.stage === "unknown");
  return <div className="rounded-lg border border-border bg-background/60 p-4" role="status" aria-live="polite">
    <p className="font-semibold">{tx.message ?? (tx.stage === "wallet" ? "Waiting for your wallet to review and sign…" : tx.stage === "receipt" ? "Waiting for receipt status and event verification…" : "Registration is not confirmed.")}</p>
    {tx.hash && <><p className="mt-2 break-all text-xs text-muted-foreground">Hash: <code>{tx.hash}</code></p><a className="mt-2 inline-block text-sm underline" href={explorerTransactionUrl(tx.hash, mstTestnet.blockExplorers.default.url)} target="_blank" rel="noreferrer">Open real transaction in MSTScan</a></>}
    {canReconcile && <div><Button className="mt-3" size="sm" variant="outline" onClick={onReconcile}>Reconcile this hash</Button><p className="mt-2 text-xs text-muted-foreground">No new registration transaction will be submitted.</p></div>}
    {tx.technical && tx.stage !== "wallet" && <details className="mt-3 text-xs text-muted-foreground"><summary>Technical details</summary><pre className="mt-2 whitespace-pre-wrap break-words">{tx.technical}</pre></details>}
  </div>;
}

export function HouseRegistrationWizard() {
  const { address, chainId, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: mstTestnet.id });
  const marketAddress = contractAddresses.market;
  const configured = Boolean(marketAddress);
  const [step, setStep] = useState<RegistrationStep>("readiness");
  const [hasSolar, setHasSolar] = useState(false);
  const [hasBattery, setHasBattery] = useState(false);
  const [capacityInput, setCapacityInput] = useState("");
  const [reviewedDeclaration, setReviewedDeclaration] = useState<HouseDeclaration>();
  const [tx, setTx] = useState<RegistrationTx>();
  const [screeningDraft, setScreeningDraft] = useState<HouseScreeningDraft>();
  const [screeningConsent, setScreeningConsent] = useState(false);
  const [screeningPreparing, setScreeningPreparing] = useState(false);
  const [billVerificationOpen, setBillVerificationOpen] = useState(true);
  const billVerificationDialogRef = useRef<HTMLDialogElement>(null);
  const verificationRef = useRef<((receipt: ReceiptLike) => Promise<void>) | null>(null);

  useEffect(() => {
    const dialog = billVerificationDialogRef.current;
    if (billVerificationOpen && dialog && !dialog.open) dialog.showModal();
  }, [billVerificationOpen]);

  const day = useReadContract({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "currentDay", chainId: mstTestnet.id, query: { enabled: configured } });
  const treasury = useReadContract({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "treasury", chainId: mstTestnet.id, query: { enabled: configured } });
  const houses = useReadContract({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "getHouses", chainId: mstTestnet.id, query: { enabled: configured } });
  const house = useReadContract({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "houses", args: address ? [address] : undefined, chainId: mstTestnet.id, query: { enabled: configured && Boolean(address) } });

  const daySnapshot = parseDaySnapshot(day.data);
  const houseSnapshot = parseHouseSnapshot(house.data);
  const houseCount = Array.isArray(houses.data) ? houses.data.length : undefined;
  const batteryCapacityWh = normalizeBatteryCapacity(hasBattery, capacityInput) ?? 0;
  const declaration: HouseDeclaration = { hasSolar, hasBattery, batteryCapacityWh };
  const declarationError = validateDeclaration(declaration);
  const treasuryKnown = configured && !treasury.isLoading && !treasury.isError && typeof treasury.data === "string";
  const dayKnown = configured && !day.isLoading && !day.isError && Boolean(daySnapshot);
  const houseKnown = Boolean(address && !house.isLoading && !house.isError && houseSnapshot);
  const capacityKnown = configured && !houses.isLoading && !houses.isError && Array.isArray(houses.data);
  const readiness = getRegistrationReadiness({
    isConnected,
    address,
    chainId,
    expectedChainId: mstTestnet.id,
    marketConfigured: configured,
    marketReadKnown: configured && Boolean(publicClient),
    treasury: typeof treasury.data === "string" ? treasury.data : undefined,
    treasuryReadKnown: treasuryKnown,
    dayReadKnown: dayKnown,
    dayActive: daySnapshot?.active,
    houseReadKnown: houseKnown,
    house: houseSnapshot,
    capacityReadKnown: capacityKnown,
    houseCount,
    declarationValid: !declarationError,
  });
  const isTreasury = readiness.isTreasury;
  const busy = transactionIsInFlight(tx?.stage);
  const signDeclaration = reviewedDeclaration ?? declaration;

  async function rereadHouse(ownerAddress: Address, reviewed: HouseDeclaration): Promise<void> {
    if (!publicClient || !marketAddress) throw new Error("Registration receipt succeeded, but the MST Testnet registry reader is unavailable.");
    const result = await publicClient.readContract({
      address: marketAddress,
      abi: VOLT_GRID_MARKET_ABI,
      functionName: "houses",
      args: [ownerAddress],
    });
    const state = parseHouseSnapshot(result);
    if (!state) throw new Error("Registration receipt succeeded, but houses(address) could not be re-read.");
    if (!state.exists || state.hasSolar !== reviewed.hasSolar || state.hasBattery !== reviewed.hasBattery || state.batteryCapacityWh !== reviewed.batteryCapacityWh) {
      throw new Error("Registration event/state mismatch: houses(address) does not match the reviewed declaration.");
    }
  }

  async function confirmHash(hash: Hash, verify: (receipt: ReceiptLike) => Promise<void>, registrationAddress: Address) {
    if (!publicClient || !marketAddress) {
      setTx({ stage: "unknown", hash, houseAddress: registrationAddress, message: "The receipt client is unavailable. Keep this hash and reconcile it when MST Testnet RPC is available.", technical: "No configured MST Testnet public client or market address" });
      return;
    }
    setTx({ stage: "receipt", hash, houseAddress: registrationAddress });
    const result = await reconcileReceipt(hash, () => publicClient.waitForTransactionReceipt({ hash }) as unknown as Promise<ReceiptLike>, verify);
    if (result.stage === "reverted") {
      const friendly = describeWalletError(new Error("Transaction receipt status was reverted"));
      setTx({ stage: "reverted", hash, houseAddress: registrationAddress, message: friendly.message, technical: friendly.technical });
      return;
    }
    if (result.stage === "unknown") {
      const friendly = describeWalletError(result.error);
      setTx({ stage: "unknown", hash, houseAddress: registrationAddress, message: friendly.kind === "unknown" ? "The receipt could not be confirmed from the expected event and state." : friendly.message, technical: friendly.technical ?? errorText(result.error) });
      return;
    }
    setTx({ stage: "confirmed", hash, houseAddress: registrationAddress, message: "On-chain house declaration confirmed: successful receipt, matching HouseRegistered event, and matching houses(address) state." });
  }

  async function submitRegistration() {
    if (!marketAddress || !address || !readiness.canSign || !reviewedDeclaration || busy) return;
    const registrationAddress = address;
    const reviewed = reviewedDeclaration;
    if (validateDeclaration(reviewed)) {
      setTx({ stage: "error", message: "The reviewed declaration is invalid. Return to declaration and correct the battery capacity." });
      return;
    }
    setStep("sign");
    const verify = async (receipt: ReceiptLike) => {
      const event = findHouseRegisteredEvent(receipt.logs, marketAddress, registrationAddress);
      if (!event || !declarationMatchesEvent(reviewed, event, registrationAddress)) throw new Error("event mismatch: expected HouseRegistered from the configured market for the reviewed account and fields.");
      await rereadHouse(registrationAddress, reviewed);
    };
    verificationRef.current = verify;
    setTx({ stage: "wallet", houseAddress: registrationAddress, message: "Review the exact declaration in your wallet and sign registerHouse." });
    try {
      const hash = await writeContractAsync({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "registerHouse", args: [reviewed.hasSolar, reviewed.hasBattery, reviewed.batteryCapacityWh], chainId: mstTestnet.id });
      await confirmHash(hash, verify, registrationAddress);
    } catch (error) {
      const friendly = describeWalletError(error);
      setTx({ stage: "error", message: friendly.message, technical: friendly.technical });
    }
  }

  async function reconcile() {
    if (!tx?.hash || tx.stage !== "unknown" || !verificationRef.current || busy) return;
    if (!tx.houseAddress) return;
    await confirmHash(tx.hash, verificationRef.current, tx.houseAddress);
  }

  const stepIndex = steps.findIndex((item) => item.key === step);
  const canContinue = readiness.canSign && !declarationError && !busy;

  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <dialog
        ref={billVerificationDialogRef}
        aria-labelledby="bill-verification-title"
        aria-describedby="bill-verification-description"
        onCancel={() => setBillVerificationOpen(false)}
        onClose={() => setBillVerificationOpen(false)}
        className="m-auto max-h-[92dvh] w-[min(94vw,48rem)] max-w-none overflow-y-auto rounded-xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/70"
      >
        <div className="space-y-4 p-4 sm:p-6">
          <header className="space-y-2">
            <Badge variant="outline">First step · supporting bill check</Badge>
            <h2 id="bill-verification-title" className="text-xl font-bold sm:text-2xl">Check a recent electricity bill</h2>
            <p id="bill-verification-description" className="text-sm text-muted-foreground">
              This demo looks for solar and net-metering clues before you continue. The official DISCOM/SNA rooftop commissioning certificate is still the primary verification evidence; bill OCR cannot verify a house or its owner.
            </p>
          </header>
          <SolarBillOcrDemo
            onScreeningDraftChange={setScreeningDraft}
            onConsentChange={setScreeningConsent}
            onPreparationChange={setScreeningPreparing}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="max-w-xl text-xs text-muted-foreground">You can continue without evidence. If a clue matched and you consented, the screening pass follows the solar declaration; the demo credential remains non-official and requires a separate confirmed registration and wallet signature.</p>
            <Button
              type="button"
              disabled={screeningConsent && (screeningPreparing || !screeningDraft)}
              onClick={() => {
                if (screeningConsent && screeningDraft) setHasSolar(true);
                setStep("declaration");
                setBillVerificationOpen(false);
              }}
            >Continue to registration</Button>
          </div>
        </div>
      </dialog>

      <header className="space-y-3"><Badge variant={readiness.canSign ? "default" : "outline"}>{readiness.canSign ? "Ready for review" : "Readiness checks incomplete"}</Badge><h1 className="text-3xl font-bold tracking-tight">Register a house</h1><p className="max-w-3xl text-muted-foreground">This progressive flow declares a model parameter on-chain. It does not request location or ownership documents, and it does not label a house physically verified.</p></header>

      <nav aria-label="House registration steps" className="grid gap-2 sm:grid-cols-5">{steps.map((item, index) => <div key={item.key} className={`rounded-md border p-3 text-sm ${index === stepIndex ? "border-primary bg-primary/5" : "border-border"}`}><span className="text-xs text-muted-foreground">{index + 1}</span><br /><strong>{item.label}</strong></div>)}</nav>

      <Card>
        <CardHeader><CardTitle>Readiness gate</CardTitle><CardDescription>The signature action stays disabled until connection, chain, verified address configuration, all RPC reads, treasury exclusion, active-day lock and capacity are known.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <CheckRow label="Connected account" ok={Boolean(isConnected && address)} detail={address ?? "Connect the wallet that will own this household."} />
          <CheckRow label="Correct chain" ok={chainId === mstTestnet.id} detail={chainId === mstTestnet.id ? `MST Testnet (${mstTestnet.id})` : `Connected chain: ${chainId ?? "unknown"}. Switch before signing.`} unknown={!isConnected} />
          <CheckRow label="Configured market" ok={configured && Boolean(publicClient)} detail={marketAddress ?? "Market address is not configured; signing is paused."} unknown={configured && !publicClient} />
          <CheckRow label="Treasury read and exclusion" ok={treasuryKnown && !isTreasury} detail={isTreasury ? "This account is the treasury and is blocked before signature." : treasuryKnown ? `Treasury: ${treasury.data}` : "Treasury read is unknown; not treated as safe."} unknown={!treasuryKnown} />
          <CheckRow label="Current-day read" ok={dayKnown && daySnapshot?.active === false} detail={!dayKnown ? "Current-day RPC read is unknown." : daySnapshot?.active ? "Active day: registration is frozen." : "No active day; registration is not frozen."} unknown={!dayKnown} />
          <CheckRow label="Existing house read" ok={houseKnown && !houseSnapshot?.exists} detail={!houseKnown ? "houses(address) is unknown; not treated as unregistered." : houseSnapshot?.exists ? "Already registered; append-only contract blocks another registration." : "Account is not currently registered."} unknown={!houseKnown} />
          <CheckRow label="House capacity" ok={capacityKnown && (houseCount ?? MAX_HOUSES) < MAX_HOUSES} detail={!capacityKnown ? "Registry capacity read is unknown." : `${houseCount ?? 0} / ${MAX_HOUSES} registered`} unknown={!capacityKnown} />
          {isTreasury && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">This account equals the market treasury. It cannot be a household. Connect a different wallet; retry is intentionally disabled.</p>}
          {!isConnected && <div className="flex flex-wrap gap-3"><ConnectButton /><NetworkSwitcher /></div>}
          {isConnected && <NetworkWarning />}
          <p className="pt-2 text-sm text-muted-foreground">{readiness.reason}</p>
        </CardContent>
      </Card>

      {step === "readiness" && <Card><CardHeader><CardTitle>Start when ready</CardTitle><CardDescription>Next you will choose solar and battery declarations explicitly.</CardDescription></CardHeader><CardContent><Button onClick={() => setStep("declaration")} disabled={!readiness.canSign}>Continue to declaration</Button></CardContent></Card>}

      {step === "declaration" && <Card><CardHeader><CardTitle>Declaration</CardTitle><CardDescription>Select both capabilities. Nothing is assumed. If battery is off, the contract argument will be exactly zero.</CardDescription></CardHeader><CardContent className="space-y-6">
        <fieldset className="space-y-3"><legend className="font-semibold">Solar declared?</legend><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2"><input type="radio" name="has-solar" checked={hasSolar} onChange={() => setHasSolar(true)} /> Yes</label><label className="flex items-center gap-2"><input type="radio" name="has-solar" checked={!hasSolar} onChange={() => setHasSolar(false)} /> No</label></div></fieldset>
        {hasSolar && <SolarCertificateEvidenceNotice compact />}
        <fieldset className="space-y-3"><legend className="font-semibold">Battery declared?</legend><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2"><input type="radio" name="has-battery" checked={hasBattery} onChange={() => setHasBattery(true)} /> Yes</label><label className="flex items-center gap-2"><input type="radio" name="has-battery" checked={!hasBattery} onChange={() => { setHasBattery(false); setCapacityInput(""); }} /> No</label></div></fieldset>
        {hasBattery ? <div className="max-w-sm space-y-2"><label htmlFor="battery-capacity" className="font-semibold">Declared battery capacity (Wh)</label><Input id="battery-capacity" type="number" min={1} max={MAX_BATTERY_CAPACITY_WH} step={1} value={capacityInput} onChange={(event) => setCapacityInput(event.target.value)} aria-describedby="capacity-help" /><p id="capacity-help" className="text-xs text-muted-foreground">Positive integer, 1–{MAX_BATTERY_CAPACITY_WH.toLocaleString()} Wh. This is a declared model parameter, not a measured rating or state of charge.</p></div> : <p className="rounded-md border border-border p-3 text-sm">Battery is off; capacity submitted to the contract will be 0 Wh. Registration does not enable emergency dispatch.</p>}
        {declarationError && <p className="text-sm text-destructive" role="alert">{declarationError}</p>}
        <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setStep("readiness")}>Back</Button><Button onClick={() => { setReviewedDeclaration(declaration); setStep("review"); }} disabled={!readiness.canSign || Boolean(declarationError)}>Review declaration</Button></div>
      </CardContent></Card>}

      {step === "review" && <Card><CardHeader><CardTitle>Review before wallet opens</CardTitle><CardDescription>These exact values will be passed to registerHouse. The wallet will not open until you choose the sign action below.</CardDescription></CardHeader><CardContent className="space-y-5">
        <dl className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border border-border p-3"><dt className="text-xs text-muted-foreground">Account</dt><dd className="mt-1 break-all text-sm">{address}</dd></div><div className="rounded-md border border-border p-3"><dt className="text-xs text-muted-foreground">Network</dt><dd className="mt-1 text-sm">MST Testnet ({mstTestnet.id})</dd></div><div className="rounded-md border border-border p-3 sm:col-span-2"><dt className="text-xs text-muted-foreground">Market contract</dt><dd className="mt-1 break-all text-sm">{marketAddress}</dd></div><div className="rounded-md border border-border p-3"><dt className="text-xs text-muted-foreground">Solar</dt><dd className="mt-1 text-sm">{signDeclaration.hasSolar ? "Yes" : "No"}</dd></div><div className="rounded-md border border-border p-3"><dt className="text-xs text-muted-foreground">Battery</dt><dd className="mt-1 text-sm">{signDeclaration.hasBattery ? "Yes" : "No"}</dd></div><div className="rounded-md border border-border p-3"><dt className="text-xs text-muted-foreground">Capacity</dt><dd className="mt-1 text-sm">{signDeclaration.batteryCapacityWh.toLocaleString()} Wh declared</dd></div></dl>
        <p className="text-sm text-muted-foreground">Registration is append-only. Battery consent is a separate action after registration and is never implied here. This declaration does not measure physical equipment or enable real emergency dispatch. If solar is declared, its government commissioning certificate remains required evidence; this transaction does not verify that certificate.</p>
        <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setStep("declaration")} disabled={busy}>Edit declaration</Button><Button onClick={() => void submitRegistration()} disabled={!canContinue || !reviewedDeclaration}>Open wallet to sign registration</Button></div>
      </CardContent></Card>}

      {(step === "sign" || step === "receipt") && <Card><CardHeader><CardTitle>{tx?.stage === "confirmed" ? "House declaration confirmed" : "Wallet-sign and receipt verification"}</CardTitle><CardDescription>Only a successful receipt, matching HouseRegistered event from the expected market, and matching houses(address) state can confirm the on-chain model declaration. This is not physical or official house verification.</CardDescription></CardHeader><CardContent className="space-y-4"><RegistrationTransaction tx={tx} onReconcile={() => void reconcile()} />{tx?.stage === "confirmed" && <div className="space-y-4"><div className="flex flex-wrap gap-3"><Link href="/house"><Button>View house status</Button></Link><Link href="/wallet"><Button variant="outline">Open wallet</Button></Link></div>{screeningDraft && tx.houseAddress && reviewedDeclaration?.hasSolar && <HouseScreeningDemoCredentialPanel houseAddress={tx.houseAddress} draft={screeningDraft} />}{screeningDraft && !reviewedDeclaration?.hasSolar && <p className="rounded-md border border-border p-3 text-sm" role="status">The final on-chain declaration says no solar. The earlier OCR phrase match does not override it, so no house screening demo credential can be minted.</p>}</div>}{tx?.stage === "error" && <Button variant="outline" onClick={() => setStep("review")}>Return to review</Button>}</CardContent></Card>}
    </main>
  );
}
