import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Home, Leaf, RefreshCw } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { reportLovableError } from "../lib/lovable-error-reporting";

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-3">
      <div className="relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#ff2d8f] via-[#f72585] to-[#ff69b4] text-white shadow-[0_12px_35px_rgba(247,37,133,0.32)]">
        <Leaf className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#09090b] bg-emerald-400" />
      </div>

      {!compact && (
        <div>
          <div className="text-base font-extrabold tracking-tight text-white">
            WasteWise
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ff4ca0]">
            AI Pantry
          </div>
        </div>
      )}
    </div>
  );
}

function PageBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-[-12rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#f72585]/12 blur-[120px]" />
      <div className="absolute bottom-[-14rem] right-[-8rem] h-[30rem] w-[30rem] rounded-full bg-violet-500/10 blur-[130px]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
    </div>
  );
}

function NotFoundComponent() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08080a] px-4 py-12 text-white">
      <PageBackdrop />

      <div className="relative z-10 w-full max-w-2xl text-center">
        <BrandMark />

        <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/60 backdrop-blur-xl">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff4ca0]" />
          Navigation error
        </div>

        <h1 className="mt-6 bg-gradient-to-b from-white via-white to-white/35 bg-clip-text text-8xl font-black tracking-[-0.08em] text-transparent sm:text-9xl">
          404
        </h1>

        <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
          This page has gone missing
        </h2>

        <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-white/50 sm:text-base">
          The page may have been moved, renamed, or removed. Your pantry data is
          still safe.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f72585] to-[#ff4ca0] px-6 text-sm font-bold text-white shadow-[0_14px_40px_rgba(247,37,133,0.28)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(247,37,133,0.36)]"
          >
            <Home className="h-4 w-4" />
            Go home
          </Link>

          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-6 text-sm font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Go back
          </button>
        </div>
      </div>
    </main>
  );
}

function ErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, {
      boundary: "tanstack_root_error_component",
    });
  }, [error]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08080a] px-4 py-12 text-white">
      <PageBackdrop />

      <div className="relative z-10 w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#121216]/80 p-6 text-center shadow-[0_35px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-10">
        <BrandMark />

        <div className="mx-auto mt-9 grid h-16 w-16 place-items-center rounded-2xl border border-[#ff4d6d]/25 bg-[#ff4d6d]/10 text-[#ff5f7c] shadow-[0_14px_35px_rgba(255,77,109,0.12)]">
          <AlertTriangle className="h-7 w-7" />
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">
          Something interrupted WasteWise
        </h1>

        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/50">
          {error?.message || "An unexpected error occurred."}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f72585] to-[#ff4ca0] px-6 text-sm font-bold text-white shadow-[0_14px_40px_rgba(247,37,133,0.28)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(247,37,133,0.36)]"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>

          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-6 text-sm font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
          >
            <Home className="h-4 w-4" />
            Return home
          </Link>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "WasteWise AI — Waste less. Save more.",
      },
      {
        name: "description",
        content:
          "WasteWise AI helps households track groceries, monitor expiry dates, predict waste risk and rescue food before it goes to waste.",
      },
      {
        name: "author",
        content: "WasteWise AI",
      },
      {
        name: "application-name",
        content: "WasteWise AI",
      },
      {
        name: "theme-color",
        content: "#09090b",
      },
      {
        property: "og:title",
        content: "WasteWise AI — Smarter pantries, less waste",
      },
      {
        property: "og:description",
        content:
          "Track pantry items, predict waste risk and rescue food before it is too late.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
    ],

    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg?v=4",
      },
      {
        rel: "shortcut icon",
        type: "image/svg+xml",
        href: "/favicon.svg?v=4",
      },
      {
        rel: "apple-touch-icon",
        href: "/favicon.svg?v=4",
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap",
      },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <head>
        <HeadContent />
      </head>

      <body className="min-h-screen bg-[#09090b] font-sans text-white antialiased selection:bg-[#f72585]/35 selection:text-white">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />

        <Toaster
          richColors
          theme="dark"
          position="top-right"
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "border border-white/10 bg-[#15151a]/95 text-white shadow-2xl backdrop-blur-xl",
              description: "text-white/55",
              actionButton: "bg-[#f72585] text-white",
              cancelButton: "bg-white/10 text-white",
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}