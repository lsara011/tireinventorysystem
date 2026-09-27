import type { Metadata } from "next";
import { Header } from "./Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tire Inventory",
  description: "Track tire inventory, orders, and suppliers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-950">
        <Header />
        {children}
      </body>
    </html>
  );
}
