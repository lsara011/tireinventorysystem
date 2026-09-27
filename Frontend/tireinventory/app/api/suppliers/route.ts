export async function POST(request: Request) {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return Response.json({ detail: "Backend API URL is not configured." }, { status: 500 });
  }

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/suppliers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    });
    const body = await response.json().catch(() => null);
    return Response.json(body, { status: response.status });
  } catch {
    return Response.json({ detail: "The supplier service is unavailable." }, { status: 502 });
  }
}
