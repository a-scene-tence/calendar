"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function AuthButton() {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    location.reload();
  }

  if (!user) {
    return (
      <a href="/login" className="text-sm text-sky-600 underline">
        로그인
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 truncate max-w-[140px]">
        {user.email}
      </span>
      <button onClick={signOut} className="text-sm text-gray-500 underline">
        로그아웃
      </button>
    </div>
  );
}
