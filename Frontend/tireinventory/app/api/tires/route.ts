export async function POST(request: Request) {
  const apiUrl = process.env.API_URL;

  if (!apiUrl) {
    return Response.json(
      { detail: "The backend API URL is not configured." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/tires`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    });
    const body = await response.json().catch(() => null);

    return Response.json(body, { status: response.status });
  } catch {
    return Response.json(
      { detail: "The inventory service is unavailable." },
      { status: 502 },
    );
  }
}
