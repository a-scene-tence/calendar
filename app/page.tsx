import CalendarCard from "@/components/cards/CalendarCard";
import BudgetCard from "@/components/cards/BudgetCard";

export default function DashboardPage() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">개인 대시보드</h1>
        <p className="text-gray-500 text-sm mt-1">{dateStr}</p>
      </header>
      <main className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CalendarCard />
        <BudgetCard />
      </main>
    </div>
  );
}
