export function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-up mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {children}
    </div>
  );
}
