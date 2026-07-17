import { Link } from "@tanstack/react-router";
import { Leaf } from "lucide-react";

export function PublicFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4 sm:px-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-pink text-white shadow-glow">
              <Leaf className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-base font-bold">WasteWise</span>
              <span className="text-[10px] font-medium uppercase tracking-widest text-primary">
                AI
              </span>
            </div>
          </div>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            Smarter pantries. Less waste. Better households.
          </p>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Product</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <a className="hover:text-foreground" href="#features">
                Features
              </a>
            </li>
            <li>
              <a className="hover:text-foreground" href="#how-it-works">
                How It Works
              </a>
            </li>
            <li>
              <a className="hover:text-foreground" href="#rescue">
                Rescue Mode
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Account</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/login" className="hover:text-foreground">
                Login
              </Link>
            </li>
            <li>
              <Link to="/register" className="hover:text-foreground">
                Register
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Company</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <a className="hover:text-foreground" href="#about">
                About
              </a>
            </li>
            <li>
              <span className="text-muted-foreground/70">Privacy (placeholder)</span>
            </li>
            <li>
              <span className="text-muted-foreground/70">Contact (placeholder)</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} WasteWise AI · Student project preview
      </div>
    </footer>
  );
}
