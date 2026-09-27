export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const apiUrl = process.env.API_URL;

  if (!apiUrl) {
    return Response.json({ detail: "Backend API URL is not configured." }, { status: 500 });
  }
  if (!/^\d+$/.test(id)) {
    return Response.json({ detail: "Invalid order ID." }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/orders/${id}/invoice-url`,
      { cache: "no-store" },
    );
    const body = (await response.json().catch(() => null)) as {
      detail?: string;
      url?: string;
    } | null;

    if (!response.ok || !body?.url) {
      return Response.json(
        { detail: body?.detail ?? "Invoice unavailable." },
        { status: response.status },
      );
    }

    return Response.redirect(body.url);
  } catch {
    return Response.json({ detail: "The invoice service is unavailable." }, { status: 502 });
  }
}
