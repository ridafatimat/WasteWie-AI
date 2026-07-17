import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  ShieldAlert,
  Receipt,
  ShoppingBasket,
  ChefHat,
  History,
  LogOut,
  Menu,
  X,
  Leaf,
  User,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pantry", label: "Smart Pantry", icon: Package },
  { to: "/rescue-mode", label: "Rescue Mode", icon: ShieldAlert },
  { to: "/receipts", label: "Receipt Upload", icon: Receipt },
  { to: "/recommendations", label: "Grocery Ideas", icon: ShoppingBasket },
  { to: "/recipes", label: "Recipes", icon: ChefHat },
  { to: "/history", label: "History", icon: History },
] as const;

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate({ to: "/login" });
  };

  const SidebarInner = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-border/60 px-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-pink text-white shadow-glow">
          <Leaf className="h-5 w-5" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold">WasteWise</span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-primary">
            AI
          </span>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="active-pill"
                  className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon className={cn("h-4.5 w-4.5", active && "text-primary")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border/60 p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-card hover:text-foreground"
        >
          <LogOut className="h-4.5 w-4.5" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border/60 bg-sidebar md:block">
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-border/60 bg-sidebar md:hidden"
            >
              {SidebarInner}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-card hover:text-foreground md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate text-lg font-semibold">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 sm:flex">
              <div className="grid h-6 w-6 place-items-center rounded-full bg-gradient-pink text-white">
                <User className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs text-muted-foreground">
                {user?.email ?? "Signed in"}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={handleLogout} className="hidden sm:inline-flex">
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Logout
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            key={pathname}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
