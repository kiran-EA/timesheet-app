'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuthStore } from '@/store/authStore';
import { isTokenExpired } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, initAuth, logout } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');

    if (!token || isTokenExpired(token)) {
      // Clear stale/expired session and send to login
      logout();
      router.push('/login');
      return;
    }

    initAuth();
    setChecking(false);
  }, [router, initAuth, logout]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}
