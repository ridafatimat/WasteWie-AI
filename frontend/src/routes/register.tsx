import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Leaf, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { register as apiRegister } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { extractApiError, parseFieldErrors } from "@/services/api/client";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — WasteWise AI" },
      { name: "description", content: "Create a WasteWise AI household account." },
    ],
  }),
  component: RegisterPage,
});

/**
 * The exact request fields depend on POST /auth/register in the backend
 * OpenAPI schema. This form ships with commonly-required fields (name, email,
 * password, household_name). If the backend rejects or requires different
 * fields, the 422 response is parsed and shown field-by-field.
 */
function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    household_name: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      // Send all fields; backend will ignore or validate.
      await apiRegister(form);
      // Attempt auto-login for convenience.
      try {
        await login(form.email, form.password);
        navigate({ to: "/dashboard" });
      } catch {
        navigate({ to: "/login" });
      }
    } catch (err) {
      setFieldErrors(parseFieldErrors(err));
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 bg-radial-pink opacity-60" />
      </div>
      <Link
        to="/"
        className="absolute left-6 top-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to home
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md rounded-3xl border border-border bg-card/90 p-8 shadow-card backdrop-blur"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-pink text-white shadow-glow">
            <Leaf className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold">Create your account</div>
            <div className="text-xs text-muted-foreground">Start rescuing food today</div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {(
            [
              { k: "name", label: "Your name", type: "text", placeholder: "Alex" },
              { k: "household_name", label: "Household name", type: "text", placeholder: "Our home" },
              { k: "email", label: "Email", type: "email", placeholder: "user@example.com" },
              { k: "password", label: "Password", type: "password", placeholder: "••••••••" },
            ] as const
          ).map((f) => (
            <div key={f.k}>
              <Label htmlFor={f.k}>{f.label}</Label>
              <Input
                id={f.k}
                type={f.type}
                required={f.k === "email" || f.k === "password"}
                value={form[f.k]}
                onChange={set(f.k)}
                placeholder={f.placeholder}
                className="mt-1.5"
              />
              {fieldErrors[f.k] && (
                <p className="mt-1 text-xs text-danger">{fieldErrors[f.k]}</p>
              )}
            </div>
          ))}
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-pink text-white shadow-glow hover:opacity-95"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:text-primary-bright">
            Sign in
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
