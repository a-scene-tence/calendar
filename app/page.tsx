import CalendarMonth from "@/components/cards/CalendarMonth";
import AuthButton from "@/components/AuthButton";

// "오늘" 마커가 빌드 시점에 정적으로 고정되지 않도록 동적 렌더 강제(요청마다 SSR).
// 정적 프리렌더에선 빌드 날짜가 "오늘"로 굳어 SW/CDN 캐시 경로로 어제가 표시되는 회귀가 있었다.
export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    <div className="max-w-2xl mx-auto px-3 py-4 sm:px-4 sm:py-6">
      <header className="mb-3 sm:mb-4 flex items-center justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Do & Done" className="h-8 w-auto" />
        <AuthButton />
      </header>
      <main>
        <CalendarMonth />
      </main>
    </div>
  );
}
