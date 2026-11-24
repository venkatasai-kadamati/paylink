import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = (await cookies()).get("paylink_session");
  // Signed-out visitors don't need to wait for a sleeping API to see sign-in.
  if (!session)
    return Response.json(
      { detail: "Not signed in" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const response = await fetch(
      `${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/api/me`,
      {
        headers: { Cookie: `paylink_session=${session.value}` },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      },
    );
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        detail: "The server is taking longer to respond. Please sign in again.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
