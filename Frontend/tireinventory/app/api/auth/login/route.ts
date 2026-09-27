import { cookies } from "next/headers";

type LoginResponse = {
  access_token?: string;
  expires_in?: number;
  detail?: string;
  user?: { id: string; email: string | null };
};

export async function POST(request: Request) {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return Response.json(
      { detail: "Authentication is not configured." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as LoginResponse | null;

    if (!response.ok || !body?.access_token) {
      return Response.json(
        { detail: body?.detail ?? "Unable to sign in." },
        { status: response.status },
      );
    }

    const cookieStore = await cookies();
    cookieStore.set("tis_access_token", body.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: body.expires_in ?? 3600,
    });

    return Response.json({ user: body.user });
  } catch {
    return Response.json(
      { detail: "The authentication service is unavailable." },
      { status: 502 },
    );
  }
}
