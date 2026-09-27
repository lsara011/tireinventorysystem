async function getTireUrl(params: Promise<{ id: string }>) {
  const { id } = await params;
  const apiUrl = process.env.API_URL;

  if (!apiUrl) return { error: "The backend API URL is not configured." };
  if (!/^\d+$/.test(id)) return { error: "Invalid tire ID." };

  return {
    url: `${apiUrl.replace(/\/$/, "")}/tires/${encodeURIComponent(id)}`,
  };
}

async function forwardMutation(
  request: Request,
  params: Promise<{ id: string }>,
  method: "PUT",
) {
  const target = await getTireUrl(params);

  if (target.error) {
    return Response.json(
      { detail: target.error },
      { status: target.error.startsWith("Invalid") ? 400 : 500 },
    );
  }

  try {
    const response = await fetch(target.url!, {
      method,
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    });

    if (response.status === 204) return new Response(null, { status: 204 });

    const body = await response.json().catch(() => null);
    return Response.json(body, { status: response.status });
  } catch {
    return Response.json(
      { detail: "The inventory service is unavailable." },
      { status: 502 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return forwardMutation(request, params, "PUT");
}
