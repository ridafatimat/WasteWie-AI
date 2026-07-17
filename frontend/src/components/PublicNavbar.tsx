import { Link } from "@tanstack/react-router";
import { Leaf, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export function PublicNavbar() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#features", label: "Features" },
    { href: "#how-it-works", label: "How It Works" },
    { href: "#rescue", label: "Rescue Mode" },
    { href: "#about", label: "About" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-pink text-white shadow-glow transition-transform group-hover:scale-105">
            <Leaf className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-base font-bold tracking-tight">WasteWise</span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-primary">
              AI
            </span>
          </div>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="relative rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link to="/login">
            <Button variant="ghost" className="text-foreground hover:bg-card">
              Login
            </Button>
          </Link>
          <Link to="/register">
            <Button className="bg-gradient-pink text-white shadow-glow hover:opacity-95">
              Register
            </Button>
          </Link>
        </div>
        <button
          className="md:hidden rounded-lg p-2 text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-border/60 bg-background/95 backdrop-blur"
          >
            <div className="mx-auto max-w-7xl px-4 py-4 flex flex-col gap-1">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-card hover:text-foreground"
                >
                  {l.label}
                </a>
              ))}
              <div className="mt-2 flex gap-2">
                <Link to="/login" className="flex-1">
                  <Button variant="outline" className="w-full">
                    Login
                  </Button>
                </Link>
                <Link to="/register" className="flex-1">
                  <Button className="w-full bg-gradient-pink text-white">Register</Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
