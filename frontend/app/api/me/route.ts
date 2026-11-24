import { readSession } from "../session-read";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request: Request) {
  return readSession(request, "/me");
}
