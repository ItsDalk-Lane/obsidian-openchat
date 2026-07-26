import { NextResponse, type NextRequest } from "next/server";
import {
  isApiRequestOriginAllowed,
  isLanApiTokenAllowed,
  shouldCheckApiRequestOrigin,
  shouldRequireLanApiToken,
} from "@/lib/request-security";

export function proxy(request: NextRequest) {
  if (shouldCheckApiRequestOrigin(request) && !isApiRequestOriginAllowed(request)) {
    return NextResponse.json({ error: "Cross-origin API requests are not allowed" }, { status: 403 });
  }
  if (shouldRequireLanApiToken(request) && !isLanApiTokenAllowed(request)) {
    return NextResponse.json({ error: "Missing or invalid LAN API token" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
