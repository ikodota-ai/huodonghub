export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50 max-w-2xl mx-auto">
      {children}
      <footer className="py-8 text-center text-xs text-ink-300">成都广播电视台 · 技术支持</footer>
    </div>
  );
}
