"use client";

import { useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 3;
const MAX_IMAGE_EDGE = 1800;

const TESSERACT_WORKER = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js";
const TESSERACT_CORE = "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0";
const TESSERACT_LANG = "https://tessdata.projectnaptha.com/4.0.0";
const PDF_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs";

const acceptedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

type BillSignal = {
  id: string;
  label: string;
  pattern: RegExp;
};

const billSignals: BillSignal[] = [
  {
    id: "solar",
    label: "Solar or rooftop net-metering reference",
    pattern: /\b(?:net\s*meter(?:ing)?|solar\s*(?:rooftop|generation|energy)|rooftop\s*solar)\b/i,
  },
  {
    id: "export",
    label: "Exported or injected energy detail",
    pattern: /\b(?:export(?:ed)?\s*(?:units?|energy|kwh)|units?\s*exported|injected\s*(?:units?|energy|kwh)|energy\s*export)\b/i,
  },
  {
    id: "net-units",
    label: "Net or imported units detail",
    pattern: /\b(?:net\s*units?(?:\s*billed)?|units?\s*imported|import(?:ed)?\s*(?:units?|energy|kwh)|energy\s*import)\b/i,
  },
];

type OcrResult = {
  signals: string[];
  confidence: number | null;
  pagesScanned: number;
  totalPages: number | null;
};

function fileExtension(fileName: string) {
  return fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
}

function isAllowedFile(file: File) {
  const extension = fileExtension(file.name);
  const mimeAllowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type);
  return acceptedExtensions.includes(extension) && (mimeAllowed || file.type === "");
}

function getBillSignals(text: string) {
  return billSignals.filter((signal) => signal.pattern.test(text)).map((signal) => signal.id);
}

async function createBoundedImageCanvas(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("The browser could not prepare this image for OCR.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export function SolarBillOcrDemo() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "loading" | "scanning" | "complete" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);

  const busy = stage === "loading" || stage === "scanning";

  function chooseFile(selected: File | null) {
    setFile(selected);
    setError(null);
    setResult(null);
    setStage("idle");
    setProgress(0);
    if (!selected) return;
    if (!isAllowedFile(selected)) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setError("Choose a PDF, JPEG, PNG, or WebP electricity bill.");
    } else if (selected.size > MAX_FILE_BYTES) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setError("This demo accepts files up to 10 MB. Choose a smaller copy of the bill.");
    } else if (selected.size === 0) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setError("The selected file is empty. Choose a readable bill file.");
    }
  }

  async function runOcr() {
    if (!file || busy || processingRef.current) return;

    processingRef.current = true;
    setStage("loading");
    setProgress(0);
    setError(null);
    setResult(null);

    let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | null = null;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng", 1, {
        workerPath: TESSERACT_WORKER,
        corePath: TESSERACT_CORE,
        langPath: TESSERACT_LANG,
        logger: (message) => {
          if (Number.isFinite(message.progress)) {
            setProgress(Math.max(0, Math.min(100, Math.round(message.progress * 100))));
          }
        },
      });

      setStage("scanning");
      let recognizedText = "";
      let confidenceTotal = 0;
      let confidenceCount = 0;
      let pagesScanned = 0;
      let totalPages: number | null = null;

      if (fileExtension(file.name) === ".pdf") {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        try {
          const pdf = await loadingTask.promise;
          totalPages = pdf.numPages;
          const pagesToScan = Math.min(pdf.numPages, MAX_PDF_PAGES);

          for (let pageNumber = 1; pageNumber <= pagesToScan; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const initialViewport = page.getViewport({ scale: 1 });
            const scale = Math.min(1.5, MAX_IMAGE_EDGE / Math.max(initialViewport.width, initialViewport.height));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.ceil(viewport.width));
            canvas.height = Math.max(1, Math.ceil(viewport.height));
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) throw new Error("The browser could not prepare this PDF page for OCR.");

            await page.render({ canvas, canvasContext: context, viewport }).promise;
            const recognized = await worker.recognize(canvas);
            recognizedText += `\n${recognized.data.text}`;
            if (Number.isFinite(recognized.data.confidence)) {
              confidenceTotal += recognized.data.confidence;
              confidenceCount += 1;
            }
            pagesScanned += 1;
            canvas.width = 0;
            canvas.height = 0;
          }
        } finally {
          await loadingTask.destroy();
        }
      } else {
        const canvas = await createBoundedImageCanvas(file);
        const recognized = await worker.recognize(canvas);
        recognizedText = recognized.data.text;
        if (Number.isFinite(recognized.data.confidence)) {
          confidenceTotal = recognized.data.confidence;
          confidenceCount = 1;
        }
        pagesScanned = 1;
        canvas.width = 0;
        canvas.height = 0;
      }

      setResult({
        signals: getBillSignals(recognizedText),
        confidence: confidenceCount ? Math.round(confidenceTotal / confidenceCount) : null,
        pagesScanned,
        totalPages,
      });
      setProgress(100);
      setStage("complete");
    } catch {
      setError("OCR could not read this file. Check that it is not password-protected and that the OCR engine can load, then try again.");
      setStage("error");
    } finally {
      processingRef.current = false;
      if (worker) await worker.terminate().catch(() => undefined);
    }
  }

  function reset() {
    if (processingRef.current) return;
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setError(null);
    setResult(null);
    setStage("idle");
    setProgress(0);
  }

  const matchedLabels = result?.signals.map((id) => billSignals.find((signal) => signal.id === id)?.label).filter(Boolean) ?? [];

  return (
    <section className="space-y-3 rounded-lg border border-border bg-background/40 p-3" aria-labelledby={`${inputId}-heading`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`${inputId}-heading`} className="font-semibold">Electricity-bill OCR demo</h3>
        <Badge variant="outline">Local screening · not official verification</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Select a recent bill to look for solar/net-metering, export, and net-unit wording. OCR and PDF rendering run in this browser; the bill, recognized text, and result are not uploaded or saved. The OCR engine and English language data are downloaded to your browser when you run it.
      </p>

      <div className="space-y-2">
        <label htmlFor={inputId} className="block text-sm font-medium">Choose a bill (PDF, JPEG, PNG, or WebP; up to 10 MB)</label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
          disabled={busy}
          onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)}
          className="block w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-foreground"
        />
        {file && <p className="text-xs text-muted-foreground">Bill selected locally ({(file.size / (1024 * 1024)).toFixed(1)} MB). The file name is not shown in VoltGrid.</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={runOcr} disabled={!file || busy}>
          {busy ? "Checking bill…" : "Run local OCR check"}
        </Button>
        {(file || result || error) && <Button type="button" variant="outline" onClick={reset} disabled={busy}>Clear bill and result</Button>}
      </div>

      {busy && (
        <div role="status" aria-live="polite" className="space-y-1 text-sm">
          <p>{stage === "loading" ? "Loading the local OCR engine…" : "Scanning bill text in this browser…"} {progress}%</p>
          <progress className="h-2 w-full accent-primary" max={100} value={progress} aria-label="OCR progress" />
        </div>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {result && (
        <div className="space-y-2 rounded-md border border-border p-3" role="status" aria-live="polite">
          <p className="font-medium">
            {result.signals.length >= 2 ? "Possible supporting bill clues found" : result.signals.length === 1 ? "One possible bill clue found" : "No matching bill phrases detected"}
          </p>
          {matchedLabels.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">{matchedLabels.map((label) => <li key={label}>{label}</li>)}</ul>
          ) : (
            <p className="text-sm text-muted-foreground">This is not evidence that the home lacks solar. Utility labels vary and OCR can miss text.</p>
          )}
          <p className="text-xs text-muted-foreground">
            {result.pagesScanned} {result.pagesScanned === 1 ? "page" : "pages"} scanned{result.totalPages && result.totalPages > result.pagesScanned ? ` (first ${result.pagesScanned} of ${result.totalPages})` : ""}
            {result.confidence !== null ? ` · OCR text confidence ${result.confidence}%` : ""}. OCR confidence is not document authenticity.
          </p>
          <p className="text-sm font-semibold">Bill screening only — the house remains <strong>not verified in VoltGrid</strong>.</p>
          <p className="text-xs text-muted-foreground">For a real verification decision, review the official DISCOM/SNA commissioning certificate and owner-accessible DISCOM account. A bill phrase cannot prove identity, ownership, installation, or issuer authenticity.</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">For this demo, only the first {MAX_PDF_PAGES} PDF pages are scanned. Nothing is persisted; use Clear to release the selected file from this page.</p>
    </section>
  );
}
