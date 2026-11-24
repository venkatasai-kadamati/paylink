import { NextResponse } from "next/server";

export function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return Response.json({ detail: "Origin not permitted" }, { status: 403 });

  // The backend uses stateless JWTs. Clear the same HttpOnly cookie without
  // requiring a possibly sleeping API/database to complete a logout.
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  response.cookies.set("paylink_session", "", {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 0,
  });
  return response;
}
