import { z } from "zod";

/**
 * What /api/public/shukraan-register accepts. The form checks a registration against this same
 * schema before the payment step, so nobody pays for a registration the API would refuse.
 */
export const registrationSchema = z.object({
  gender: z.enum(["Kadın", "Erkek"]),
  group_id: z.string().trim().min(1).max(40),
  /** Set by the academy after payment; the form sends "". */
  level: z.enum(["", "A2", "B1", "B2"]),
  availability: z.string().trim().max(1000).optional().default(""),
  full_name: z.string().trim().min(2).max(120),
  whatsapp: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(255),
  goal: z.string().trim().min(1).max(2000),
  /** The discount code used ("" without one); this column held the Dâd answer before. */
  eligibility: z.string().trim().max(40),
  /** The group chosen in «Tercih ettiğin grup» (src/lib/groups.ts); an older page sends none. */
  group: z.string().trim().max(60).optional().default(""),
  /** The payment attempt's id: a retried save never takes a second place in the group. */
  ref: z.string().trim().max(80).optional().default(""),
});

export type RegistrationPayload = z.input<typeof registrationSchema>;
