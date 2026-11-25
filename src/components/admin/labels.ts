import type { CourseType, Gender } from "@/components/shukraan/data";
import type { Day, GroupStatus, TimeSlot } from "@/lib/groups";

/** The panel's Arabic names for the groups' and the waitlist's values. */
export const COURSE_AR: Record<CourseType, string> = { regular: "العادية", intensive: "المكثّفة (+)" };
export const GENDER_AR: Record<Gender, string> = { Kadın: "نساء", Erkek: "رجال" };
export const DAY_AR: Record<Day, string> = { mon: "الإثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", sat: "السبت", sun: "الأحد" };
export const TIME_AR: Record<TimeSlot, string> = { morning: "صباحًا 09:00–12:00", noon: "ظهرًا 12:00–17:00", evening: "مساءً 17:00–22:00" };
export const STATUS_AR: Record<GroupStatus, string> = { open: "مفتوحة", full: "مكتملة", closed: "مغلقة" };

export const cell = "border-t border-[#071027]/10 px-3 py-2 align-top";
export const input = "rounded-lg border border-[#071027]/20 bg-white px-2 py-1.5 text-sm";
export const btn = "rounded-full border border-[#071027]/25 px-3 py-1.5 text-sm hover:bg-[#071027]/5 disabled:opacity-40";
export const primaryBtn = "rounded-full bg-[#071027] px-4 py-2 text-sm text-[#f3ead7] disabled:opacity-40";
/** A wa.me link to open a chat by hand (nothing is sent automatically). */
export const waHref = (n: string) => `https://wa.me/${n.replace(/\D/g, "").replace(/^00/, "")}`;
