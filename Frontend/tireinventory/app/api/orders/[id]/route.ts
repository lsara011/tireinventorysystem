type RouteContext = {
  params: Promise<{ id: string }>;
};

function backendOrderUrl(id: string) {
  const apiUrl = process.env.API_URL;

  if (!apiUrl) {
    return { error: "Backend API URL is not configured." } as const;
  }
  if (!/^\d+$/.test(id)) {
    return { error: "Invalid order ID.", status: 400 } as const;
  }

  return { url: `${apiUrl.replace(/\/$/, "")}/orders/${id}` } as const;
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const destination = backendOrderUrl(id);

  if ("error" in destination) {
    return Response.json(
      { detail: destination.error },
      { status: destination.status ?? 500 },
    );
  }

  try {
    const response = await fetch(destination.url, {
      method: "PUT",
      body: await request.formData(),
    });
    const body = await response.json().catch(() => null);
    return Response.json(body, { status: response.status });
  } catch {
    return Response.json(
      { detail: "The order service is unavailable." },
      { status: 502 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const destination = backendOrderUrl(id);

  if ("error" in destination) {
    return Response.json(
      { detail: destination.error },
      { status: destination.status ?? 500 },
    );
  }

  try {
    const response = await fetch(destination.url, { method: "DELETE" });
    if (response.status === 204) return new Response(null, { status: 204 });

    const body = await response.json().catch(() => null);
    return Response.json(body, { status: response.status });
  } catch {
    return Response.json(
      { detail: "The order service is unavailable." },
      { status: 502 },
    );
  }
}
