import { TireInventory, type Tire } from "./TireInventory";

async function getTires(): Promise<Tire[]> {
  const response = await fetch(`${process.env.API_URL}/tires`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load tires");
  }

  return response.json();
}

type HomeProps = {
  searchParams: Promise<{ action?: string | string[] }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { action } = await searchParams;
  const tires = await getTires();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <TireInventory
        key={action === "add" ? "adding" : "inventory"}
        tires={tires}
        initiallyAdding={action === "add"}
      />
    </main>
  );
}
