import { SupplierManager, type Supplier } from "./SupplierManager";

async function getSuppliers(): Promise<Supplier[]> {
  const response = await fetch(`${process.env.API_URL}/suppliers`, {
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Unable to load suppliers");
  return response.json();
}

export default async function SuppliersPage() {
  const suppliers = await getSuppliers();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <SupplierManager suppliers={suppliers} />
    </main>
  );
}
