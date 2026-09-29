"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Award,
  LayoutDashboard,
  MoreHorizontal,
  Settings,
  Sun,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppAccount } from "@/lib/services/provider";
import styles from "./app-shell.module.css";

const primaryNavigation = [
  { href: "/overview", label: "Overview", Icon: LayoutDashboard },
  { href: "/play", label: "Play day", Icon: Sun },
  { href: "/market", label: "Energy market", Icon: ArrowLeftRight },
  { href: "/wallet", label: "Wallet", Icon: WalletCards },
] as const;

const moreNavigation = [
  { href: "/emergency", label: "Grid emergency", Icon: AlertTriangle },
  { href: "/certificates", label: "Solar records", Icon: Award },
  { href: "/activity", label: "Activity", Icon: Activity },
  { href: "/house", label: "House", Icon: WalletCards },
  { href: "/settings", label: "Settings", Icon: Settings },
  { href: "/auth/sign-in", label: "Account", Icon: UserRound },
] as const;

function NavigationLink({
  href,
  label,
  Icon,
  current = false,
  compact = false,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  current?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={compact ? label : undefined}
      aria-current={current ? "page" : undefined}
      className={cn(styles.navLink, current && styles.navLinkCurrent, compact && styles.navLinkCompact)}
    >
      <Icon aria-hidden="true" className={styles.navIcon} />
      <span className={styles.navLabel}>{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const { state: accountState, user } = useAppAccount();
  useEffect(() => setHydrated(true), []);
  const isCurrent = (href: string) => {
    if (!hydrated || !pathname) return false;
    if (href === "/overview") return pathname === "/" || pathname === "/overview";
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  const accountLabel = accountState === "signed-in" ? "Account" : accountState === "checking" ? "Account…" : accountState === "unavailable" ? "Account offline" : "Sign in";

  return (
    <div className={styles.shell}>
      <a className={cn("skip-link", styles.skipLink)} href="#main-content">Skip to main content</a>

      <aside className={styles.sidebar} aria-label="Primary navigation">
        <p className={styles.sidebarEyebrow}>Workspace</p>
        <nav className={styles.desktopNav} aria-label="Main">
          {primaryNavigation.map((item) => <NavigationLink key={item.label} {...item} current={isCurrent(item.href)} />)}
        </nav>
        <p className={styles.sidebarEyebrow}>Neighbourhood</p>
        <nav className={styles.desktopNav} aria-label="Neighbourhood energy">
          {moreNavigation.map((item) => <NavigationLink key={item.label} {...item} current={isCurrent(item.href)} />)}
        </nav>
        <div className={styles.sidebarStatus}>
          <Badge variant="outline" aria-label="MST Testnet configured"><span className={styles.statusDot} aria-hidden="true" /><span className={styles.statusText}>MST Testnet</span></Badge>
          <p>Wallet writes require your signature. Modelled readings are not meter data.</p>
        </div>
      </aside>

      <div className={styles.contentColumn}>
        <header className={styles.topbar}>
          <Link className={styles.brand} href="/overview" aria-label="VoltGrid overview">
            <span className={styles.brandMark} aria-hidden="true">V</span>
            <span className={styles.brandCopy}><strong>VoltGrid</strong><small>Neighbourhood energy</small></span>
          </Link>
          <div className={styles.topbarMeta}>
            <Badge className={styles.networkBadge}><span className={styles.statusDot} aria-hidden="true" />MST TESTNET ONLY</Badge>
            <span className={styles.modelLabel}>Model v1 · sim-core + confirmed receipts</span>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">{user?.email ?? (accountState === "signed-in" ? "Signed in" : accountState === "unavailable" ? "Public mode" : "")}</span>
              <Link href="/auth/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>{accountLabel}</Link>
              <Link href="/wallet" className={buttonVariants({ variant: "outline", size: "sm" })}>Wallet</Link>
            </div>
          </div>
        </header>

        {children}

        <nav className={styles.mobileNav} aria-label="Primary navigation">
          {primaryNavigation.map((item) => <NavigationLink key={item.label} {...item} current={isCurrent(item.href)} compact />)}
          <details className={styles.moreMenu}>
            <summary aria-label="More VoltGrid sections">
              <MoreHorizontal aria-hidden="true" className={styles.navIcon} />
              <span>More</span>
            </summary>
            <div className={styles.moreMenuItems}>
              {moreNavigation.map((item) => <NavigationLink key={item.label} {...item} current={isCurrent(item.href)} />)}
            </div>
          </details>
        </nav>
      </div>
    </div>
  );
}
