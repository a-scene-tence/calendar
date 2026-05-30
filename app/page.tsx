import CalendarMonth from "@/components/cards/CalendarMonth";
import AuthButton from "@/components/AuthButton";

export default function CalendarPage() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-7 sm:py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-gray-900">
            Do &amp; Done
          </h1>
          <p className="text-gray-500 text-[13px] mt-1">{dateStr}</p>
        </div>
        <AuthButton />
      </header>
      <main>
        <CalendarMonth />
      </main>
    </div>
  );
}
