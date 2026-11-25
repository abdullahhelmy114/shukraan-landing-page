"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Emblem } from "@/components/shukraan/Emblem";
import { api } from "./api";

/** The panel's links: pages, groups, waitlist. */
export function AdminNav() {
  const link = "rounded-full border border-[#f3ead7]/40 px-4 py-2 text-sm hover:bg-[#f3ead7]/10";
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="أقسام لوحة التحكم">
      <Link href="/admin" className={link}>
        الصفحات
      </Link>
      <Link href="/admin/groups" className={link}>
        المجموعات
      </Link>
      <Link href="/admin/waitlist" className={link}>
        قائمة الانتظار
      </Link>
    </nav>
  );
}

/** The groups and waitlist pages' frame: the panel's header, its links and logout. */
export function AdminFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="admin-root min-h-screen bg-[#f3ead7]/60 text-[#071027]" dir="rtl" lang="ar">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-[#071027] px-5 py-4 text-[#f3ead7] sm:px-8">
        <div className="flex items-center gap-3">
          <Emblem className="h-10 w-auto text-[#f3ead7]" />
          <div>
            <p className="font-arabic text-xl font-bold">لوحة التحكم</p>
            <p className="text-xs opacity-70">{title}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminNav />
          <button
            type="button"
            className="rounded-full border border-[#f3ead7]/40 px-4 py-2 text-sm hover:bg-[#f3ead7]/10"
            onClick={async () => {
              await api("logout", { method: "POST" });
              // The page then sends the browser back to the login.
              window.location.reload();
            }}
          >
            تسجيل الخروج
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
