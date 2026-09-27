function backendUrl() {
  return process.env.API_URL?.replace(/\/$/, "");
}

export async function GET(request: Request) {
  const apiUrl = backendUrl();
  if (!apiUrl) {
    return Response.json({ detail: "Backend API URL is not configured." }, { status: 500 });
  }

  const date = new URL(request.url).searchParams.get("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ detail: "Invalid sale date." }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${apiUrl}/sales${date ? `?sale_date=${encodeURIComponent(date)}` : ""}`,
      { cache: "no-store" },
    );
    const body = await response.json().catch(() => null);
    return Response.json(body, { status: response.status });
  } catch {
    return Response.json({ detail: "The sales service is unavailable." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const apiUrl = backendUrl();
  if (!apiUrl) {
    return Response.json({ detail: "Backend API URL is not configured." }, { status: 500 });
  }

  try {
    const response = await fetch(`${apiUrl}/sales`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    });
    const body = await response.json().catch(() => null);
    return Response.json(body, { status: response.status });
  } catch {
    return Response.json({ detail: "The sales service is unavailable." }, { status: 502 });
  }
}
