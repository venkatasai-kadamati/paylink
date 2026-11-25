import { NextResponse } from "next/server";

export function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next can reconstruct request.url using its bind address (0.0.0.0),
  // not the browser-facing host. Compare Origin to the original Host instead.
  // The platform supplies the external scheme when TLS terminates upstream.
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    new URL(request.url).protocol.slice(0, -1);
  const host = request.headers.get("host") || new URL(request.url).host;
  const expectedOrigin = `${protocol}://${host}`;
  if (
    (origin && origin !== expectedOrigin) ||
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
    secure: protocol === "https",
    path: "/",
    maxAge: 0,
  });
  return response;
}
