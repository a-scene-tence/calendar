"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function AuthButton() {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    location.reload();
  }

  if (!supabase) return null;

  if (!user) {
    return (
      <a
        href="/login"
        className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white transition active:scale-95"
      >
        로그인
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 truncate max-w-[140px]">
        {user.email}
      </span>
      <button
        onClick={signOut}
        className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-200 active:scale-95"
      >
        로그아웃
      </button>
    </div>
  );
}
