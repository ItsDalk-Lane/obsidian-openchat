import { NextResponse, type NextRequest } from "next/server";
import {
  isApiRequestAllowed,
  isLanApiTokenAllowed,
  shouldRequireLanApiToken,
} from "@/lib/request-security";

export function proxy(request: NextRequest) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (shouldRequireLanApiToken(request) && !isLanApiTokenAllowed(request)) {
    return NextResponse.json({ error: "Missing or invalid LAN API token" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
