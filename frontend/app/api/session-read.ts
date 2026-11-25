import { cookies } from "next/headers";

export async function readSession(
  request: Request,
  path: "/me" | "/workspace",
) {
  const session = (await cookies()).get("paylink_session");
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json",
  };
  if (!session)
    return Response.json({ detail: "Not signed in" }, { status: 401, headers });
  try {
    const url = new URL(
      `/api${path}`,
      process.env.BACKEND_URL || "http://127.0.0.1:8000",
    );
    const timeZone = new URL(request.url).searchParams.get("time_zone");
    if (timeZone !== null && path === "/workspace")
      url.searchParams.set("time_zone", timeZone);
    const response = await fetch(url, {
      headers: { Cookie: `paylink_session=${session.value}` },
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(55000)]),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers,
    });
  } catch {
    return Response.json(
      {
        detail:
          "We couldn’t reconnect. Your session hasn’t been signed out. Please retry.",
      },
      { status: 503, headers },
    );
  }
}
