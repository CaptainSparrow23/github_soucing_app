import { NextRequest, NextResponse } from "next/server";

export const GET = (request: NextRequest) => {
  const redirectUrl = new URL("/api/auth/microsoft/callback", request.url);
  redirectUrl.search = new URL(request.url).search;
  return NextResponse.redirect(redirectUrl);
};
