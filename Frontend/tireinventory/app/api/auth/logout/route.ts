import { cookies } from "next/headers";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete("tis_access_token");
  return Response.redirect(new URL("/login", request.url), 303);
}
