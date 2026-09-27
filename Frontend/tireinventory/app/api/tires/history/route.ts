export async function GET() {
  const apiUrl = process.env.API_URL;

  if (!apiUrl) {
    return Response.json(
      { detail: "The backend API URL is not configured." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/tire-history`,
      { cache: "no-store" },
    );
    const body = await response.json().catch(() => null);

    return Response.json(body, { status: response.status });
  } catch {
    return Response.json(
      { detail: "The inventory service is unavailable." },
      { status: 502 },
    );
  }
}
