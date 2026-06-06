"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // 이미 로그인된 세션이 있으면 동의화면을 거치지 않고 바로 메인으로.
  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user) router.replace("/");
      else setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [supabase, router]);

  async function signInWithGoogle() {
    if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar",
        redirectTo: `${location.origin}/api/auth/callback`,
        // prompt 미지정 — 이미 동의한 계정은 동의화면 없이 바로 통과.
        // access_type=offline은 refresh_token 흐름을 위해 유지.
        queryParams: { access_type: "offline" },
      },
    });
    if (error) setLoading(false);
  }

  async function signInWithOtherAccount() {
    if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar",
        redirectTo: `${location.origin}/api/auth/callback`,
        // 계정 선택 화면을 강제로 띄워 다른 구글 계정으로 전환.
        queryParams: { access_type: "offline", prompt: "select_account" },
      },
    });
    if (error) setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[var(--border)] p-8 text-center animate-pop">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Do & Done" className="mx-auto mb-3 h-14 w-auto" />
        {checking && supabase ? (
          <p className="text-gray-400 text-sm mt-2">확인 중...</p>
        ) : supabase ? (
          <>
            <p className="text-gray-500 text-sm mb-7">
              Google 계정으로 로그인하세요
            </p>
            <button
              onClick={signInWithGoogle}
              disabled={loading}
              className="w-full rounded-xl bg-brand text-white py-3 text-sm font-semibold transition hover:bg-brand-hover active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "이동 중..." : "Google로 계속하기"}
            </button>
            <button
              onClick={signInWithOtherAccount}
              disabled={loading}
              className="mt-3 text-xs text-gray-500 underline underline-offset-2 transition hover:text-gray-700 disabled:opacity-50"
            >
              다른 계정으로 로그인
            </button>
            <p className="text-[11px] text-gray-400 mt-5 leading-relaxed">
              현재 Google 검증 전(테스트 모드)입니다. 동의 화면에 &ldquo;확인되지 않은
              앱&rdquo; 경고가 뜨면 <strong>고급 → 안전하지 않은 페이지로 이동</strong>을
              눌러 진행하세요.
            </p>
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
