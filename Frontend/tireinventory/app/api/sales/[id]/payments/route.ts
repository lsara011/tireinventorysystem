export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const apiUrl = process.env.API_URL;

  if (!apiUrl) {
    return Response.json({ detail: "Backend API URL is not configured." }, { status: 500 });
  }
  if (!/^\d+$/.test(id)) {
    return Response.json({ detail: "Invalid sale ID." }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/sales/${id}/payments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await request.text(),
      },
    );
    const body = await response.json().catch(() => null);
    return Response.json(body, { status: response.status });
  } catch {
    return Response.json({ detail: "The payment service is unavailable." }, { status: 502 });
  }
}
