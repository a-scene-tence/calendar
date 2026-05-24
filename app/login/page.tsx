"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar",
        redirectTo: `${location.origin}/api/auth/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <h1 className="text-xl font-bold mb-2">개인 대시보드</h1>
        {supabase ? (
          <>
            <p className="text-gray-500 text-sm mb-6">
              Google 계정으로 로그인하세요
            </p>
            <button
              onClick={signInWithGoogle}
              disabled={loading}
              className="w-full rounded-lg bg-sky-500 text-white py-2.5 text-sm font-medium hover:bg-sky-600 disabled:opacity-50"
            >
              {loading ? "이동 중..." : "Google로 계속하기"}
            </button>
          </>
        ) : (
          <p className="text-amber-600 text-sm mt-2">
            Supabase 환경변수가 설정되지 않았습니다. <code>.env.local</code>에
            키를 입력한 뒤 다시 시도하세요.
          </p>
        )}
      </div>
    </div>
  );
}
