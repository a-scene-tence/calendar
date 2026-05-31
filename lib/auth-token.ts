import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshGoogleToken } from "@/lib/google-token";

export type TokenResult = { token: string } | { error: NextResponse };

export async function getProviderToken(): Promise<TokenResult> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let token = await refreshGoogleToken(supabase);
  if (!token) token = session?.provider_token ?? null;
  if (!token) {
    return {
      error: NextResponse.json(
        { error: "No Google token. Re-login required." },
        { status: 401 }
      ),
    };
  }
  return { token };
}
