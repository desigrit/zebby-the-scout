import { NextResponse, type NextRequest } from "next/server";
import { isAllowedHost } from "./lib/host-access";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health" &&
      request.headers.get("host") === process.env.WEBSITE_HOSTNAME) {
    return NextResponse.next();
  }
  if (!isAllowedHost(request.headers.get("host"), process.env.NODE_ENV === "development")) {
    return new Response("Not found.", {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
    });
  }
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = { matcher: "/:path*" };
