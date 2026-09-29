import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoltGrid | MST Testnet neighbourhood energy",
  description: "A transparent VoltGrid dashboard shell for simulated neighbourhood energy settlement.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers><AppShell>{children}</AppShell></Providers>
      </body>
    </html>
  );
}
