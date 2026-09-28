function backendUrl() {
  return process.env.API_URL?.replace(/\/$/, "");
}

export async function GET(request: Request) {
  const apiUrl = backendUrl();
  if (!apiUrl) {
    return Response.json({ detail: "Backend API URL is not configured." }, { status: 500 });
  }

  const searchParams = new URL(request.url).searchParams;
  const date = searchParams.get("date");
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const validDate = (value: string | null) =>
    value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);

  if (!validDate(date) || !validDate(start) || !validDate(end)) {
    return Response.json({ detail: "Invalid sale date." }, { status: 400 });
  }
  if (date && (start || end)) {
    return Response.json(
      { detail: "Use either a sale date or a date range." },
      { status: 400 },
    );
  }
  if ((start === null) !== (end === null)) {
    return Response.json(
      { detail: "Both range dates are required." },
      { status: 400 },
    );
  }
  if (start && end && end < start) {
    return Response.json(
      { detail: "The end date cannot be before the start date." },
      { status: 400 },
    );
  }

  const backendSearch = new URLSearchParams();
  if (date) backendSearch.set("sale_date", date);
  if (start && end) {
    backendSearch.set("start_date", start);
    backendSearch.set("end_date", end);
  }
  const query = backendSearch.size > 0 ? `?${backendSearch.toString()}` : "";

  try {
    const response = await fetch(
      `${apiUrl}/sales${query}`,
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
