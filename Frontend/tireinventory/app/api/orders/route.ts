export async function POST(request: Request) {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return Response.json({ detail: "Backend API URL is not configured." }, { status: 500 });
  }

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/orders`, {
      method: "POST",
      body: await request.formData(),
    });
    const body = await response.json().catch(() => null);
    return Response.json(body, { status: response.status });
  } catch {
    return Response.json({ detail: "The order service is unavailable." }, { status: 502 });
  }
}
