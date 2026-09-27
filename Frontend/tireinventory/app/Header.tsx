"use client";

import * as React from "react";
import Link from "next/link";
import { CircleGauge, Menu, Plus, X } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { useScroll } from "@/components/ui/use-scroll";
import { cn } from "@/lib/utils";

const links = [
  { label: "Inventory", href: "/" },
  { label: "Sales", href: "/sales" },
  { label: "Orders", href: "/orders" },
  { label: "Suppliers", href: "/suppliers" },
  { label: "Reports", href: "/reports" },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const scrolled = useScroll(10);
  const menuId = React.useId();

  React.useEffect(() => {
    document.body.style.overflow = pathname === "/login" ? "" : open ? "hidden" : "";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, pathname]);

  if (pathname === "/login") return null;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-zinc-200 bg-white transition-shadow",
        scrolled && !open && "shadow-sm",
      )}
    >
      <nav
        aria-label="Primary navigation"
        className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          aria-label="Tire Inventory home"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-zinc-950 text-white">
            <CircleGauge className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold">Davie Tire Shop</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.label}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              href={link.href}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
          <Button asChild>
            <Link href="/?action=add">
              <Plus className="size-4" aria-hidden="true" />
              Add tire
            </Link>
          </Button>
        </div>

        <Button
          type="button"
          size="icon"
          variant="outline"
          className="md:hidden"
          aria-controls={menuId}
          aria-expanded={open}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <Menu className="size-5" aria-hidden="true" />
          )}
        </Button>
      </nav>

      <div
        id={menuId}
        className={cn(
          "absolute inset-x-0 top-full min-h-[calc(100dvh-3.5rem)] border-t border-zinc-200 bg-white shadow-lg md:hidden",
          open ? "flex" : "hidden",
        )}
      >
        <div className="flex w-full flex-col justify-between gap-6 p-4 ">
          <div className="grid gap-1">
            {links.map((link) => (
              <Link
                key={link.label}
                className={buttonVariants({
                  variant: "ghost",
                  className: "h-11 justify-start px-3 text-base",
                })}
                href={link.href}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="grid gap-2 border-t border-zinc-200 pt-4">
            <form action="/api/auth/logout" method="post">
              <Button type="submit" variant="outline" className="w-full">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
