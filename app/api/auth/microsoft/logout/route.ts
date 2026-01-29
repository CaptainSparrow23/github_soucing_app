import { NextResponse } from "next/server";
import { clearMicrosoftAuthCookies } from "../../../../lib/microsoftAuth";

export const POST = async () => {
  const response = NextResponse.json({ ok: true });
  clearMicrosoftAuthCookies(response);
  return response;
};
