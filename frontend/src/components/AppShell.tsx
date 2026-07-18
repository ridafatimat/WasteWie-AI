import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  ChefHat,
  ChevronRight,
  Grid2X2,
  History,
  Leaf,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  ShieldAlert,
  ShoppingBasket,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { getMe } from "@/services/api";
import { cn } from "@/lib/utils";

type AppPath =
  | "/dashboard"
  | "/pantry"
  | "/rescue-mode"
  | "/receipts"
  | "/recommendations"
  | "/recipes"
  | "/history";

type NavItem = {
  to: AppPath;
  label: string;
  description: string;
  icon: LucideIcon;
};

const MAIN_NAVIGATION: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    description: "Your daily overview",
    icon: Grid2X2,
  },
  {
    to: "/pantry",
    label: "Smart Pantry",
    description: "Food and purchase batches",
    icon: Boxes,
  },
  {
    to: "/rescue-mode",
    label: "Rescue Mode",
    description: "Use urgent food first",
    icon: ShieldAlert,
  },
];

const PLAN_NAVIGATION: NavItem[] = [
  {
    to: "/receipts",
    label: "Receipt Upload",
    description: "Scan groceries with AI",
    icon: ReceiptText,
  },
  {
    to: "/recommendations",
    label: "Grocery Ideas",
    description: "Plan the next shop",
    icon: ShoppingBasket,
  },
  {
    to: "/recipes",
    label: "Recipes",
    description: "Cook before food expires",
    icon: ChefHat,
  },
  {
    to: "/history",
    label: "History",
    description: "Review pantry activity",
    icon: History,
  },
];

const SIDEBAR_STORAGE_KEY = "wastewise-sidebar-collapsed";

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const userQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getMe,
    retry: 0,
    staleTime: 5 * 60 * 1000,
  });

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const user = userQuery.data as
    | {
        name?: string | null;
        email?: string | null;
      }
    | undefined;

  const displayName = useMemo(() => {
    const name = user?.name?.trim();

    if (name) {
      return name;
    }

    const email = user?.email?.trim();

    if (email) {
      return email.split("@")[0];
    }

    return "WasteWise member";
  }, [user]);

  const email = user?.email?.trim() || "Signed in";

  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "W";

  const logout = () => {
    const tokenKeys = [
      "token",
      "access_token",
      "auth_token",
      "wastewise_token",
      "wastewise_access_token",
      "jwt",
    ];

    for (const key of tokenKeys) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }

    window.location.assign("/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DesktopSidebar
        pathname={pathname}
        collapsed={collapsed}
        onToggle={() => setCollapsed((current) => !current)}
        displayName={displayName}
        email={email}
        initials={initials}
        onLogout={logout}
      />

      <MobileSidebar
        open={mobileOpen}
        pathname={pathname}
        displayName={displayName}
        email={email}
        initials={initials}
        onClose={() => setMobileOpen(false)}
        onLogout={logout}
      />

      <div
        className={cn(
          "min-h-screen transition-[padding] duration-300 ease-out",
          collapsed ? "lg:pl-[92px]" : "lg:pl-[280px]",
        )}
      >
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="flex h-[78px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  WasteWise AI
                </div>
                <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight sm:text-2xl">
                  {title}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-3 rounded-2xl border border-border/70 bg-card/70 py-1.5 pl-1.5 pr-4 shadow-sm md:flex">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-pink-500 text-xs font-bold text-white shadow-lg shadow-primary/20">
                  {initials}
                </div>

                <div className="max-w-[210px]">
                  <p className="truncate text-xs font-semibold">
                    {displayName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {email}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-border/70 bg-card/70 px-3.5 text-sm font-semibold text-muted-foreground transition hover:border-red-500/25 hover:bg-red-500/5 hover:text-red-400"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function DesktopSidebar({
  pathname,
  collapsed,
  onToggle,
  displayName,
  email,
  initials,
  onLogout,
}: {
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
  displayName: string;
  email: string;
  initials: string;
  onLogout: () => void;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border/60 bg-card/85 shadow-[18px_0_60px_-40px_rgba(0,0,0,0.75)] backdrop-blur-xl transition-[width] duration-300 ease-out lg:flex",
        collapsed ? "w-[92px]" : "w-[280px]",
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-28 -right-24 h-64 w-64 rounded-full bg-violet-500/5 blur-3xl" />
      </div>

      <div
        className={cn(
          "relative flex h-[78px] items-center border-b border-border/60",
          collapsed ? "justify-center px-3" : "justify-between px-5",
        )}
      >
        <Brand collapsed={collapsed} />

        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="grid h-9 w-9 place-items-center rounded-xl border border-border/70 bg-background/40 text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
            aria-label="Collapse navigation"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={onToggle}
          className="relative mx-auto mt-3 grid h-8 w-8 place-items-center rounded-xl border border-border/70 bg-background/40 text-muted-foreground transition hover:border-primary/30 hover:text-primary"
          aria-label="Expand navigation"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      <nav className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 py-5">
        <NavigationGroup
          label="Workspace"
          items={MAIN_NAVIGATION}
          pathname={pathname}
          collapsed={collapsed}
        />

        <div className="my-5 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        <NavigationGroup
          label="Plan & track"
          items={PLAN_NAVIGATION}
          pathname={pathname}
          collapsed={collapsed}
        />
      </nav>

      <div className="relative border-t border-border/60 p-3">
        {collapsed ? (
          <button
            type="button"
            onClick={onLogout}
            title="Logout"
            className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-border/70 bg-background/40 text-muted-foreground transition hover:border-red-500/25 hover:bg-red-500/5 hover:text-red-400"
          >
            <LogOut className="h-5 w-5" />
          </button>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-background/35 p-2.5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-pink-500 text-xs font-bold text-white shadow-lg shadow-primary/20">
                {initials}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{displayName}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {email}
                </p>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400"
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function MobileSidebar({
  open,
  pathname,
  displayName,
  email,
  initials,
  onClose,
  onLogout,
}: {
  open: boolean;
  pathname: string;
  displayName: string;
  email: string;
  initials: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close navigation"
      />

      <aside className="relative flex h-full w-[min(88vw,330px)] flex-col border-r border-border bg-card shadow-2xl">
        <div className="flex h-[78px] items-center justify-between border-b border-border/60 px-5">
          <Brand collapsed={false} />

          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-background/40 text-muted-foreground"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <NavigationGroup
            label="Workspace"
            items={MAIN_NAVIGATION}
            pathname={pathname}
            collapsed={false}
          />

          <div className="my-5 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          <NavigationGroup
            label="Plan & track"
            items={PLAN_NAVIGATION}
            pathname={pathname}
            collapsed={false}
          />
        </nav>

        <div className="border-t border-border/60 p-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/35 p-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-pink-500 text-xs font-bold text-white">
              {initials}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      to="/dashboard"
      className={cn(
        "flex min-w-0 items-center",
        collapsed ? "justify-center" : "gap-3",
      )}
      title="WasteWise AI"
    >
      <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary via-pink-500 to-fuchsia-500 text-white shadow-lg shadow-primary/25">
        <Leaf className="h-5 w-5" />
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-card bg-emerald-400" />
      </div>

      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-base font-bold tracking-tight">
            WasteWise
          </p>
          <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            <Sparkles className="h-3 w-3" />
            AI pantry
          </div>
        </div>
      )}
    </Link>
  );
}

function NavigationGroup({
  label,
  items,
  pathname,
  collapsed,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <div>
      {!collapsed && (
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
          {label}
        </p>
      )}

      <div className="space-y-1.5">
        {items.map((item) => (
          <NavigationItem
            key={item.to}
            item={item}
            active={isActivePath(pathname, item.to)}
            collapsed={collapsed}
          />
        ))}
      </div>
    </div>
  );
}

function NavigationItem({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex min-h-12 items-center rounded-2xl border transition-all duration-200",
        collapsed ? "justify-center px-2" : "gap-3 px-3",
        active
          ? "border-primary/30 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-background/35 hover:text-foreground",
      )}
    >
      {active && (
        <span className="absolute -left-3 h-7 w-1 rounded-r-full bg-gradient-to-b from-primary to-pink-500 shadow-[0_0_18px_hsl(var(--primary))]" />
      )}

      <div
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition",
          active
            ? "border-primary/25 bg-primary/15 text-primary"
            : "border-transparent bg-transparent group-hover:border-primary/15 group-hover:bg-primary/10 group-hover:text-primary",
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </div>

      {!collapsed && (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{item.label}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/75">
              {item.description}
            </p>
          </div>

          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              active
                ? "text-primary"
                : "text-muted-foreground/50 group-hover:translate-x-0.5 group-hover:text-primary",
            )}
          />
        </>
      )}
    </Link>
  );
}

function isActivePath(pathname: string, target: AppPath) {
  if (target === "/dashboard") {
    return pathname === target;
  }

  return pathname === target || pathname.startsWith(`${target}/`);
}