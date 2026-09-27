"use client";

import * as React from "react";
import { CircleGauge, Eye, EyeOff, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

const inputClass =
  "h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition-shadow placeholder:text-zinc-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20";

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? "").trim(),
          password: String(form.get("password") ?? ""),
        }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof body?.detail === "string" ? body.detail : "Unable to sign in.",
        );
      }

      router.replace("/");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to sign in.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="w-full max-w-sm rounded-md border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-zinc-950 text-white">
            <CircleGauge className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-zinc-950">Davie Tire Shop</h1>
            <p className="text-sm text-zinc-500">Inventory management</p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4 px-6 py-5">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">Sign in</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Enter your staff account credentials.
          </p>
        </div>

        <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            className={inputClass}
            placeholder="name@example.com"
            autoFocus
            required
          />
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
          Password
          <span className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className={`${inputClass} pr-11`}
              minLength={6}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </span>
        </label>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        <Button type="submit" className="h-11 w-full" disabled={submitting}>
          <LogIn className="size-4" aria-hidden="true" />
          {submitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </section>
  );
}
