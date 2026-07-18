import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Leaf,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { extractApiError } from "@/services/api/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — WasteWise AI" },
      {
        name: "description",
        content: "Sign in to your WasteWise AI household account.",
      },
    ],
  }),
  component: LoginPage,
});

const BENEFITS = [
  "See what needs to be used first",
  "Turn receipts into pantry batches",
  "Reduce avoidable household food waste",
];

function BrandMark() {
  return (
    <Link to="/" className="inline-flex items-center gap-3">
      <div className="relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#ff2d8f] via-[#f72585] to-[#ff69b4] text-white shadow-[0_12px_35px_rgba(247,37,133,0.32)]">
        <Leaf className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#0a0a0d] bg-emerald-400" />
      </div>

      <div>
        <div className="text-base font-extrabold tracking-tight text-white">
          WasteWise
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ff4ca0]">
          AI Pantry
        </div>
      </div>
    </Link>
  );
}

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#08080a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[12%] top-[-16rem] h-[34rem] w-[34rem] rounded-full bg-[#f72585]/15 blur-[130px]" />
        <div className="absolute bottom-[-16rem] right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-violet-500/10 blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden border-r border-white/[0.07] p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
          <BrandMark />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="max-w-xl"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-[#f72585]/20 bg-[#f72585]/10 px-3 py-1 text-xs font-semibold text-[#ff64ae]">
              <Sparkles className="h-3.5 w-3.5" />
              Your pantry, made intelligent
            </div>

            <h1 className="mt-6 text-5xl font-black leading-[1.05] tracking-[-0.045em] xl:text-6xl">
              Waste less.
              <span className="block bg-gradient-to-r from-[#ff4ca0] to-[#ff85be] bg-clip-text text-transparent">
                Save more.
              </span>
            </h1>

            <p className="mt-5 max-w-lg text-base leading-8 text-white/50">
              Sign in to see what is expiring, rescue urgent food, and keep your
              household pantry organised in one place.
            </p>

            <div className="mt-9 space-y-4">
              {BENEFITS.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 text-sm text-white/72">
                  <div className="grid h-7 w-7 place-items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  {benefit}
                </div>
              ))}
            </div>
          </motion.div>

          <div className="flex items-center gap-2 text-xs text-white/35">
            <ShieldCheck className="h-4 w-4 text-emerald-400/70" />
            Secure household access powered by WasteWise AI
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <BrandMark />
              <Link
                to="/"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-white/60 transition hover:text-white"
                aria-label="Back to home"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
              className="rounded-[2rem] border border-white/[0.09] bg-[#121216]/82 p-5 shadow-[0_35px_100px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:p-8"
            >
              <div className="hidden lg:block">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 text-xs font-semibold text-white/45 transition hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to home
                </Link>
              </div>

              <div className="mt-2 lg:mt-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  Welcome back
                </div>

                <h2 className="mt-4 text-3xl font-black tracking-[-0.035em]">
                  Sign in to WasteWise
                </h2>

                <p className="mt-2 text-sm leading-6 text-white/45">
                  Continue managing your smart household pantry.
                </p>
              </div>

              <form onSubmit={onSubmit} className="mt-8 space-y-5">
                <div>
                  <Label htmlFor="email" className="text-xs font-semibold text-white/65">
                    Email address
                  </Label>
                  <div className="relative mt-2">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      required
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="user@example.com"
                      className="h-12 rounded-xl border-white/10 bg-black/25 pl-10 text-white placeholder:text-white/25 focus-visible:ring-[#f72585]/35"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="password" className="text-xs font-semibold text-white/65">
                    Password
                  </Label>
                  <div className="relative mt-2">
                    <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      required
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      className="h-12 rounded-xl border-white/10 bg-black/25 px-10 text-white placeholder:text-white/25 focus-visible:ring-[#f72585]/35"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/35 transition hover:text-white"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-[#ff4d6d]/25 bg-[#ff4d6d]/10 px-3.5 py-3 text-sm text-[#ff7c93]"
                  >
                    {error}
                  </motion.div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full rounded-xl bg-gradient-to-r from-[#f72585] to-[#ff4ca0] text-sm font-bold text-white shadow-[0_14px_40px_rgba(247,37,133,0.25)] transition hover:-translate-y-0.5 hover:opacity-100 hover:shadow-[0_18px_48px_rgba(247,37,133,0.34)]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-7 border-t border-white/[0.07] pt-6 text-center text-sm text-white/45">
                New to WasteWise?{" "}
                <Link
                  to="/register"
                  className="font-semibold text-[#ff4ca0] transition hover:text-[#ff78b7]"
                >
                  Create an account
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    </main>
  );
}