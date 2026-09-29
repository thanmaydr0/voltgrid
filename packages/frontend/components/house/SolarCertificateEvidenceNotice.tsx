import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const portalDirectory = "https://solarrooftop.pmsuryaghar.gov.in/grid_others/discomPortalLink";
const certificateProcedure = "https://solarrooftop.pmsuryaghar.gov.in/grid_others/knowledge";
const netMeteringGuide = "https://solarrooftop.pmsuryaghar.gov.in/pdf/faq_national_portal2024021301.pdf";

export function SolarCertificateEvidenceNotice({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="border-accent/40">
      <CardHeader className={compact ? "p-4" : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>India rooftop-solar verification</CardTitle>
          <Badge variant="outline">Certificate required · not verified</Badge>
        </div>
        <CardDescription>
          For an Indian solar installation, the evidence to verify is its official commissioning certificate from the applicable DISCOM, SNA, or authorized agency—not a VoltGrid declaration or wallet transaction.
        </CardDescription>
      </CardHeader>
      <CardContent className={`space-y-3 text-sm ${compact ? "px-4 pb-4" : ""}`}>
        <p className="text-muted-foreground">
          Certificate formats and processes vary by state/utility. VoltGrid currently has no secure evidence-submission or official issuer-verification integration, so it cannot mark a house solar-verified. On-chain registration below remains a model-profile declaration only.
        </p>
        <p className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm" role="status">
          Solar verification state: <strong>Not verified in VoltGrid</strong>. No certificate has been checked here.
        </p>
        <div className="space-y-2 rounded-md border border-border p-3">
          <h3 className="font-semibold">Evidence checklist for a future review</h3>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li><strong className="text-foreground">Primary evidence:</strong> the official rooftop-solar commissioning certificate issued by the applicable DISCOM/SNA or authorized agency. Check issuer, installation/consumer match, and certificate status through the issuer’s official channel.</li>
            <li><strong className="text-foreground">Corroborate with a recent bill:</strong> where that utility exposes them, compare import, export, net units, or solar-generation/meter readings. Labels and billing rules vary; a zero bill is not required, since fixed charges can remain.</li>
            <li><strong className="text-foreground">Corroborate in the DISCOM account:</strong> the owner should sign in directly to their own utility portal and inspect any rooftop/net-metering connection status. VoltGrid must not collect utility passwords or OTPs.</li>
          </ol>
          <p className="mb-0 text-xs text-muted-foreground">A bill or portal label alone is supporting evidence, not issuer-verified proof. This release has no document-upload or official review workflow and stores none of these documents.</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <a className="text-primary underline underline-offset-4" href={portalDirectory} target="_blank" rel="noreferrer">Find the official state/DISCOM portal</a>
          <a className="text-primary underline underline-offset-4" href={certificateProcedure} target="_blank" rel="noreferrer">MNRE certificate procedure and state process references</a>
          <a className="text-primary underline underline-offset-4" href={netMeteringGuide} target="_blank" rel="noreferrer">MNRE net-metering bill guide</a>
        </div>
        <p className="mb-0 text-xs text-muted-foreground">Do not upload or paste a certificate containing personal/address details until a private, access-controlled review path is available.</p>
      </CardContent>
    </Card>
  );
}
