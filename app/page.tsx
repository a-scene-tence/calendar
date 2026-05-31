import CalendarMonth from "@/components/cards/CalendarMonth";
import AuthButton from "@/components/AuthButton";

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
