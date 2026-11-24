import { cookies } from "next/headers";
import Workspace from "./workspace";

export default async function Page() {
  // Never block the document on a remote auth request. This server-only hint
  // avoids a sign-in flash; the API still verifies identity before serving data.
  const hasSession = (await cookies()).has("paylink_session");
  return <Workspace hasSession={hasSession} />;
}
