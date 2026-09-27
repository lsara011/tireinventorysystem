import { OrdersManager, type PurchaseOrder, type SupplierOption } from "./OrdersManager";

async function fetchBackend<T>(path: string, errorMessage: string): Promise<T> {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) throw new Error("Backend API URL is not configured");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
        cache: "no-store",
      });
      if (response.ok) return response.json() as Promise<T>;
      if (response.status < 500) throw new Error(errorMessage);
    } catch (error) {
      if (attempt === 2) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }

  throw new Error(errorMessage);
}

async function getOrders(): Promise<PurchaseOrder[]> {
  return fetchBackend<PurchaseOrder[]>("/orders", "Unable to load orders");
}

async function getSuppliers(): Promise<SupplierOption[]> {
  return fetchBackend<SupplierOption[]>(
    "/suppliers",
    "Unable to load suppliers",
  );
}

export default async function OrdersPage() {
  const [orders, suppliers] = await Promise.all([getOrders(), getSuppliers()]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <OrdersManager orders={orders} suppliers={suppliers} />
    </main>
  );
}
