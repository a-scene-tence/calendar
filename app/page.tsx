import CalendarMonth from "@/components/cards/CalendarMonth";

export default function CalendarPage() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">캘린더</h1>
        <p className="text-gray-500 text-sm mt-1">{dateStr}</p>
      </header>
      <main>
        <CalendarMonth />
      </main>
    </div>
  );
}
