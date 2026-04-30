'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/store/authStore';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !token) {
      router.push('/login');
    }
  }, [mounted, token, router]);

  if (!mounted) {
    return <div className="flex min-h-[100dvh] bg-[#fafafa]" />;
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#fafafa] text-zinc-500">
        <div className="flex items-center gap-3 text-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-[var(--accent)] opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent)]" />
          </span>
          Redirecting to sign in…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] bg-[#fafafa]">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-[#fafafa]">{children}</main>
    </div>
  );
}
