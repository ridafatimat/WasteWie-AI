import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Package,
  ShieldAlert,
  Receipt,
  ShoppingBasket,
  ChefHat,
  LineChart,
  Users,
  CalendarClock,
  Trash2,
  Sparkles,
  Refrigerator,
  Snowflake,
  Apple,
  Milk,
  Drumstick,
  Check,
  X,
} from "lucide-react";
import { PublicNavbar } from "@/components/PublicNavbar";
import { PublicFooter } from "@/components/PublicFooter";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/RiskBadge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WasteWise AI — Waste less. Save more. Use what you already have." },
      {
        name: "description",
        content:
          "Track pantry items, monitor expiry dates, and let AI predict which groceries are most at risk of going to waste.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Users, title: "Household Profile", desc: "Set up your household and manage members from one shared account." },
  { icon: Package, title: "Smart Pantry", desc: "Add groceries, update quantities, edit expiry dates, and keep your inventory accurate." },
  { icon: Receipt, title: "Receipt Upload & OCR", desc: "Snap a receipt and review the extracted items before adding them to your pantry." },
  { icon: CalendarClock, title: "Expiry Tracking", desc: "See what's expiring today, this week, and next — with clear visual cues." },
  { icon: Trash2, title: "Waste Logging", desc: "Record consumed, wasted, expired or adjusted quantities per item." },
  { icon: ShieldAlert, title: "Waste-Risk Prediction", desc: "See which items are most likely to go unused — and understand exactly why." },
  { icon: Sparkles, title: "Rescue Mode", desc: "Prioritise the items that need attention first and take immediate action." },
  { icon: ShoppingBasket, title: "Grocery Recommendations", desc: "Get shopping suggestions based on stock levels and consumption patterns." },
  { icon: ChefHat, title: "Recipe Suggestions", desc: "Discover recipes that prioritise ingredients approaching their expiry date." },
  { icon: LineChart, title: "Dashboard & Trends", desc: "Track how your household's consumption evolves week after week." },
  { icon: Refrigerator, title: "Inventory History", desc: "Every event, every change — a complete timeline of your pantry." },
  { icon: Snowflake, title: "Behaviour Learning", desc: "The system learns your household patterns to sharpen its recommendations." },
];

const steps = [
  { n: 1, title: "Add groceries", desc: "Manually or by uploading a receipt for OCR." },
  { n: 2, title: "Review & maintain", desc: "Keep quantities and expiries up to date." },
  { n: 3, title: "Get alerts", desc: "Expiry reminders and waste-risk predictions." },
  { n: 4, title: "Record outcomes", desc: "Consumed, wasted, or expired — the model learns." },
];

const rescueSample = [
  { name: "Apples", pct: 90, band: "high", reason: "Expires in 1 day" },
  { name: "Milk", pct: 80, band: "high", reason: "Rescue Mode adjusted risk" },
  { name: "Fresh Milk", pct: 70, band: "medium", reason: "Consumption below average" },
  { name: "Frozen Chicken", pct: 35, band: "low", reason: "Frozen, ample time remaining" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />
      <Hero />
      <Features />
      <HowItWorks />
      <RescueShowcase />
      <WhyWasteWise />
      <CTA />
      <PublicFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 bg-radial-pink opacity-70" />
        <div className="absolute right-[8%] top-[20%] h-72 w-72 rounded-full bg-primary/20 blur-3xl animate-float" />
        <div className="absolute left-[6%] bottom-[10%] h-64 w-64 rounded-full bg-primary-bright/15 blur-3xl animate-float" />
      </div>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col justify-center"
        >
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary-soft">
            <Sparkles className="h-3.5 w-3.5" />
            AI-powered pantry intelligence
          </div>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Waste less. <span className="gradient-text-pink">Save more.</span>{" "}
            Use what you already have.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            WasteWise AI helps your household track groceries, monitor expiry dates, understand
            consumption habits, and rescue food before it goes to waste.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register">
              <Button
                size="lg"
                className="bg-gradient-pink text-white shadow-glow hover:opacity-95"
              >
                Get Started
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="outline" className="border-border">
                View Features
              </Button>
            </a>
          </div>
          <div className="mt-8 flex items-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-success" /> Free during preview
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-success" /> No credit card
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative"
        >
          <div className="relative rounded-3xl border border-border bg-card/80 p-5 shadow-card backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  Dashboard preview
                </div>
                <div className="text-base font-semibold">Your pantry, at a glance</div>
              </div>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-primary">
                Preview
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Pantry items", val: 42, color: "text-foreground" },
                { label: "Expiring soon", val: 6, color: "text-warning" },
                { label: "High risk", val: 3, color: "text-danger" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-border bg-card-elevated p-3"
                >
                  <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-primary/30 bg-primary-dark/60 p-4">
              <div className="flex items-center gap-2 text-primary-soft">
                <ShieldAlert className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-widest">
                  Rescue Mode
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {[
                  { icon: Milk, name: "Milk", tag: "Expires in 1 day", band: "high" },
                  { icon: Apple, name: "Apples", tag: "Expires today", band: "high" },
                  { icon: Drumstick, name: "Frozen Chicken", tag: "Low risk", band: "low" },
                ].map((r) => (
                  <div
                    key={r.name}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                        <r.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground">{r.tag}</div>
                      </div>
                    </div>
                    <RiskBadge band={r.band} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute -bottom-6 -right-4 h-28 w-28 rounded-full bg-gradient-pink opacity-40 blur-2xl" />
        </motion.div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="border-t border-border/60 bg-secondary-bg/40">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHead
          eyebrow="Features"
          title="Everything your kitchen needs"
          desc="Twelve focused capabilities that turn a chaotic pantry into an intelligent, self-aware system."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.4, delay: i * 0.03 }}
              whileHover={{ y: -4 }}
              className="group rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40"
            >
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border/60">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHead
          eyebrow="How it works"
          title="From receipt to rescue in four steps"
          desc="A simple, repeatable loop that gets smarter each time you use it."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="relative rounded-2xl border border-border bg-card p-5"
            >
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-gradient-pink text-sm font-bold text-white shadow-glow">
                {s.n}
              </div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RescueShowcase() {
  return (
    <section id="rescue" className="border-t border-border/60 bg-secondary-bg/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <SectionHead
            align="left"
            eyebrow="Rescue Mode"
            title="Predictions that lead to action"
            desc="WasteWise combines machine-learning predictions with expiry and storage rules to make Rescue Mode more practical."
          />
          <p className="mt-6 max-w-md text-sm text-muted-foreground">
            The scores below are a product preview — real values come from your own pantry once
            you sign in.
          </p>
        </div>
        <div className="space-y-3">
          {rescueSample.map((r, i) => (
            <motion.div
              key={r.name}
              initial={{ opacity: 0, x: 16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
              className={`rounded-2xl border p-4 ${
                r.band === "high"
                  ? "border-primary/50 bg-primary-dark/50 glow-pink"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.reason}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-bold tabular-nums">{r.pct}%</div>
                  <RiskBadge band={r.band} />
                </div>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background">
                <div
                  className={`h-full rounded-full ${
                    r.band === "high"
                      ? "bg-danger"
                      : r.band === "medium"
                        ? "bg-warning"
                        : "bg-success"
                  }`}
                  style={{ width: `${r.pct}%` }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyWasteWise() {
  return (
    <section id="about" className="border-t border-border/60">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHead
          eyebrow="Why WasteWise"
          title="Small changes. Big compound impact."
          desc="Every wasted item is money spent, effort ignored, and food that could have fed someone."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { title: "Reduce food waste", desc: "Actionable alerts before food expires." },
            { title: "Avoid duplicate purchases", desc: "See stock before adding to the cart." },
            { title: "Household insights", desc: "Personalised patterns over time." },
          ].map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <div className="mb-2 h-1 w-10 rounded-full bg-gradient-pink" />
              <h3 className="text-base font-semibold">{b.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{b.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Without WasteWise
            </div>
            <ul className="space-y-2 text-sm">
              {[
                "Forgotten groceries",
                "Duplicate purchases",
                "Expired food",
                "No clear household history",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2 text-muted-foreground">
                  <X className="h-4 w-4 text-danger" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-primary/40 bg-primary-dark/40 p-6">
            <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary-soft">
              With WasteWise
            </div>
            <ul className="space-y-2 text-sm">
              {[
                "Visible pantry",
                "Expiry reminders",
                "Actionable risk scores",
                "Better consumption tracking",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2 text-foreground">
                  <Check className="h-4 w-4 text-success" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <h2 className="text-3xl font-bold sm:text-4xl">
            Ready to make your pantry <span className="gradient-text-pink">smarter?</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Sign up in seconds and start rescuing food today.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/register">
              <Button size="lg" className="bg-gradient-pink text-white shadow-glow">
                Create Account
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline">
                Login
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function SectionHead({
  eyebrow,
  title,
  desc,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  desc: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "text-center" : ""}>
      <div
        className={`mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary-soft`}
      >
        {eyebrow}
      </div>
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      <p
        className={`mt-3 text-muted-foreground ${
          align === "center" ? "mx-auto max-w-2xl" : "max-w-2xl"
        }`}
      >
        {desc}
      </p>
    </div>
  );
}
