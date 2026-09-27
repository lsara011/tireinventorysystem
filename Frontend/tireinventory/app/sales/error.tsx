"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function SalesError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="border-y border-zinc-200 bg-white py-10 text-center">
        <h1 className="text-xl font-semibold text-zinc-950">
          Daily sales are temporarily unavailable
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          No sales data was changed.
        </p>
        <Button type="button" className="mt-5" onClick={reset}>
          <RotateCcw className="size-4" aria-hidden="true" /> Try again
        </Button>
      </div>
    </main>
  );
}
