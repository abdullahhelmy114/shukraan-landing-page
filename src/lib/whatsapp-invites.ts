import { readFile } from "node:fs/promises";
import path from "node:path";
import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { WHATSAPP_GROUPS, type WhatsAppInvite } from "@/components/shukraan/data";
import { communityFile, type Group } from "@/lib/groups";
import BUNDLE from "./generated/whatsapp-bundle.json";
import { decodePng, encodePngRGB, type RGBAImage } from "./png";

/**
 * Each WhatsApp group's invite comes from whatsapp-gruplari/ at the project root (outside public/,
 * so nothing in it has a URL): <file>.txt holds the link and logolar/<file>.png the logo set in the
 * middle of its QR code, which the server draws. The build bundles both into the server
 * (scripts/bundle-whatsapp.mjs -> generated/whatsapp-bundle.json), so no host reads the folder at
 * run time; Cloudflare Workers have no file system. Without a bundle (tests, `next dev`), the
 * folder itself is read. Server-only.
 */
export const INVITES_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "whatsapp-gruplari");

/** A QR code drawn and checked at build time (scripts/bundle-whatsapp.mjs). */
export type PrerenderedQr = { qr: string; width: number; verified: boolean };

/** Where the link files and logos (and, from the build, finished QR codes) are read from. */
export type InviteSource = {
  id: string;
  text(file: string): Promise<string | null>;
  logo(file: string): Promise<Uint8Array | null>;
  prerendered?(file: string): Promise<PrerenderedQr | null>;
};

/** The folder on disk (tests, `next dev`). */
export const folderSource = (dir: string): InviteSource => ({
  id: dir,
  text: (file) => readFile(path.join(dir, `${file}.txt`), "utf8").catch(() => null),
  logo: async (file) => {
    const b = await readFile(path.join(dir, "logolar", `${file}.png`)).catch(() => null);
    return b ? new Uint8Array(b) : null;
  },
});

type Bundle = Record<string, { text: string | null; logo: string | null; qr?: string; width?: number; verified?: boolean }>;

/** The copy built into the server (scripts/bundle-whatsapp.mjs). */
export const bundleSource = (bundle: Bundle): InviteSource => ({
  id: "bundle",
  text: async (file) => bundle[file]?.text ?? null,
  logo: async (file) => {
    const b64 = bundle[file]?.logo;
    return b64 ? new Uint8Array(Buffer.from(b64, "base64")) : null;
  },
  prerendered: async (file) => {
    const g = bundle[file];
    return g?.qr && g.width ? { qr: g.qr, width: g.width, verified: g.verified === true } : null;
  },
});

/** The bundle when the build made one with any group in it; otherwise the folder. */
export function defaultSource(): InviteSource {
  const bundle = BUNDLE as Bundle;
  return Object.values(bundle).some((g) => g.text !== null || g.logo !== null) ? bundleSource(bundle) : folderSource(INVITES_DIR);
}

const asSource = (s: string | InviteSource) => (typeof s === "string" ? folderSource(s) : s);

const LINK_PREFIX = "https://chat.whatsapp.com/";

/** The link in a group's .txt file, or null while it is the placeholder or not a WhatsApp link. */
export function parseLink(text: string): string | null {
  const line = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line?.startsWith(LINK_PREFIX)) return null;
  try {
    const url = new URL(line);
    const code = url.pathname.replace(/^\/+|\/+$/g, "");
    if (url.protocol !== "https:" || url.hostname !== "chat.whatsapp.com" || !code) return null;
    return code.toUpperCase() === "PLACEHOLDER" ? null : line;
  } catch {
    return null;
  }
}

// ── The QR code ─────────────────────────────────────────────────────────────────────────────
type RGB = readonly [number, number, number];
const NAVY: RGB = [0x15, 0x24, 0x48]; // --navy
const GOLD: RGB = [0xd0, 0xa3, 0x48]; // --gold
const WHITE: RGB = [255, 255, 255];

/** Pixels per module: the image is drawn at twice the size the page shows it (sharp on 2x screens). */
export const QR_MODULE_PX = 10;
/** Quiet zone, in modules. */
export const QR_QUIET_MODULES = 4;
/** The logo's diameter as a share of the code's width (without the quiet zone). */
const LOGO_SHARE = 0.24;
const RING_PX = 3; // thin gold ring around the logo's white disc
const DISC_GAP_PX = 4; // white space between the logo and the ring
const CORNER_RADIUS = 0.3; // small modules are softly rounded; the corner squares stay square

/** Area-averaging resize of a straight-alpha RGBA image. */
export function resizeRGBA(src: Uint8Array | Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number) {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const fx = sw / dw;
  const fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = y * fy;
    const y1 = y0 + fy;
    for (let x = 0; x < dw; x++) {
      const x0 = x * fx;
      const x1 = x0 + fx;
      let r = 0, g = 0, b = 0, a = 0, w = 0;
      for (let yy = Math.floor(y0); yy < Math.min(sh, Math.ceil(y1)); yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        for (let xx = Math.floor(x0); xx < Math.min(sw, Math.ceil(x1)); xx++) {
          const wt = wy * (Math.min(x1, xx + 1) - Math.max(x0, xx));
          const i = (yy * sw + xx) * 4;
          const al = (src[i + 3]! / 255) * wt;
          r += src[i]! * al;
          g += src[i + 1]! * al;
          b += src[i + 2]! * al;
          a += al;
          w += wt;
        }
      }
      const o = (y * dw + x) * 4;
      if (a > 0) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
      }
      out[o + 3] = (a / w) * 255;
    }
  }
  return out;
}

/** Share of a pixel (4×4 samples) inside a module cell's rounded square. */
function roundedCover(px: number, py: number, m: number, r: number) {
  if ((px >= r && px + 1 <= m - r) || (py >= r && py + 1 <= m - r)) return 1;
  let inside = 0;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const sx = px + (i + 0.5) / 4;
      const sy = py + (j + 0.5) / 4;
      const dx = Math.max(r - sx, 0, sx - (m - r));
      const dy = Math.max(r - sy, 0, sy - (m - r));
      if (dx * dx + dy * dy <= r * r) inside++;
    }
  return inside / 16;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * The QR code for a link as a PNG: error correction H, a 4-module quiet zone, navy modules on white
 * (corner squares square, the rest softly rounded), and the logo (a round image, transparent
 * outside its circle) in the middle on a white disc with a thin gold ring; the modules under it are
 * left out. Returns the PNG and the width, in CSS pixels, the page shows it at.
 */
export function renderQr(url: string, logo: RGBAImage | null, mask?: number): { width: number; rgba: Uint8Array; size: number } {
  const qr = QRCode.create(url, mask === undefined ? { errorCorrectionLevel: "H" } : { errorCorrectionLevel: "H", maskPattern: mask as QRCode.QRCodeMaskPattern });
  const n = qr.modules.size;
  const m = QR_MODULE_PX;
  const quiet = QR_QUIET_MODULES * m;
  const size = n * m + 2 * quiet;
  const c = size / 2;
  const logoPx = Math.round(n * m * LOGO_SHARE);
  const discR = logoPx / 2 + DISC_GAP_PX + RING_PX;
  const clearR = discR + m / 2;
  const isFinder = (r: number, col: number) => (r < 7 && col < 7) || (r < 7 && col >= n - 7) || (r >= n - 7 && col < 7);
  const dark = (r: number, col: number) => {
    if (!qr.modules.get(r, col)) return false;
    if (!logo || isFinder(r, col)) return true;
    return Math.hypot(quiet + (col + 0.5) * m - c, quiet + (r + 0.5) * m - c) >= clearR;
  };
  const logoImg = logo ? resizeRGBA(logo.data, logo.width, logo.height, logoPx, logoPx) : null;
  const logoX = Math.round(c - logoPx / 2);

  const png = { width: size, height: size, data: new Uint8Array(size * size * 4) };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let col: RGB = WHITE;
      const mx = Math.floor((x - quiet) / m);
      const my = Math.floor((y - quiet) / m);
      if (mx >= 0 && my >= 0 && mx < n && my < n && dark(my, mx)) {
        const cover = isFinder(my, mx) ? 1 : roundedCover(x - quiet - mx * m, y - quiet - my * m, m, m * CORNER_RADIUS);
        col = mix(WHITE, NAVY, cover);
      }
      if (logoImg) {
        const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
        if (d < discR + 1) {
          const outer = Math.min(1, Math.max(0, discR - d + 0.5));
          const inner = Math.min(1, Math.max(0, discR - RING_PX - d + 0.5));
          col = [0, 1, 2].map((k) => col[k]! * (1 - outer) + GOLD[k]! * (outer - inner) + WHITE[k]! * inner) as unknown as RGB;
        }
        const lx = x - logoX;
        const ly = y - logoX;
        if (lx >= 0 && ly >= 0 && lx < logoPx && ly < logoPx) {
          const i = (ly * logoPx + lx) * 4;
          col = mix(col, [logoImg[i]!, logoImg[i + 1]!, logoImg[i + 2]!], logoImg[i + 3]! / 255);
        }
      }
      const o = (y * size + x) * 4;
      png.data[o] = Math.round(col[0]);
      png.data[o + 1] = Math.round(col[1]);
      png.data[o + 2] = Math.round(col[2]);
      png.data[o + 3] = 255;
    }
  }
  return { width: size / 2, rgba: png.data, size };
}

/** Whether jsQR and ZXing, two independent decoders, both read `url` back from an RGBA image. */
export function decodesTo(url: string, rgba: Uint8Array | Uint8ClampedArray, w: number, h: number) {
  const pixels = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length);
  if (jsQR(pixels, w, h, { inversionAttempts: "dontInvert" })?.data !== url) return false;
  const lum = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (pixels[i * 4]! * 299 + pixels[i * 4 + 1]! * 587 + pixels[i * 4 + 2]! * 114) / 1000;
  try {
    const hints = new Map<DecodeHintType, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]],
      [DecodeHintType.TRY_HARDER, true],
    ]);
    return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, w, h))), hints).getText() === url;
  } catch {
    return false;
  }
}

/**
 * The QR code the page receives: the encoder's own mask first, then the other masks, keeping the
 * first one that both decoders read at the size the page shows it and at half that size.
 */
export async function bestQr(url: string, logo: RGBAImage | null): Promise<{ png: Uint8Array; width: number }> {
  let chosen: ReturnType<typeof renderQr> | null = null;
  for (const mask of [undefined, 0, 1, 2, 3, 4, 5, 6, 7]) {
    const qr = renderQr(url, logo, mask);
    chosen ??= qr;
    const readable = [qr.width, Math.round(qr.width / 2)].every((w) => decodesTo(url, resizeRGBA(qr.rgba, qr.size, qr.size, w, w), w, w));
    if (readable) {
      chosen = qr;
      break;
    }
  }
  const { width, rgba, size } = chosen!;
  return { png: await encodePngRGB({ width: size, height: size, data: rgba }), width };
}

// ── A group's invite ────────────────────────────────────────────────────────────────────────
const cache = new Map<string, Promise<WhatsAppInvite>>();

/** A group's logo from logolar/<file>.png, or null if it has none. */
async function readLogo(src: InviteSource, file: string): Promise<RGBAImage | null> {
  const bytes = await src.logo(file);
  if (!bytes) return null;
  try {
    return await decodePng(bytes);
  } catch {
    return null;
  }
}

/** A group's invite (its link and QR code with its logo), or null while it has no real link. */
export async function readInvite(from: string | InviteSource, file: string): Promise<WhatsAppInvite | null> {
  const src = asSource(from);
  const text = await src.text(file);
  const url = text === null ? null : parseLink(text);
  if (!url) return null;
  // Drawn at build time: nothing to compute here (Workers limit CPU time per request).
  const pre = await src.prerendered?.(file);
  if (pre?.qr.startsWith("data:image/png;base64,")) return { url, qr: pre.qr, width: pre.width };
  const key = `${src.id}\n${file}\n${url}`;
  let invite = cache.get(key);
  if (!invite) {
    invite = readLogo(src, file).then(async (logo) => {
      const { png, width } = await bestQr(url, logo);
      return { url, qr: `data:image/png;base64,${Buffer.from(png).toString("base64")}`, width };
    });
    cache.set(key, invite);
    invite.catch(() => cache.delete(key));
  }
  return invite;
}

/** The invite for a saved group id ("Kadın", "Erkek+" …); an unknown id has none. */
export async function inviteForGroup(groupId: string, from: string | InviteSource = defaultSource()): Promise<WhatsAppInvite | null> {
  const group = WHATSAPP_GROUPS.find((g) => g.id === groupId);
  return group ? readInvite(from, group.file) : null;
}

/**
 * A scheduled group's invite (src/lib/groups.ts): its own files (whatsapp-gruplari/<group id>.txt
 * and logolar/<group id>.png) once it has a link there, otherwise its course and group type's
 * community files, as before.
 */
export async function inviteForScheduledGroup(group: Pick<Group, "id" | "course" | "gender">, from: string | InviteSource = defaultSource()): Promise<WhatsAppInvite | null> {
  const src = asSource(from);
  const own = await src.text(group.id);
  return readInvite(src, own !== null && parseLink(own) ? group.id : communityFile(group.course, group.gender));
}

/**
 * For the start-up log: how many groups the folder has a link file, a real link and a logo for,
 * and how many QR codes the server drew that both decoders read back (this also warms the cache).
 */
export async function describeInvites(
  from: string | InviteSource = defaultSource(),
): Promise<{ groups: number; found: number; linked: number; logos: number; verified: number }> {
  const src = asSource(from);
  let found = 0;
  let linked = 0;
  let logos = 0;
  let verified = 0;
  for (const g of WHATSAPP_GROUPS) {
    const text = await src.text(g.file);
    if (text !== null) found += 1;
    if (await readLogo(src, g.file)) logos += 1;
    if (text === null || !parseLink(text)) continue;
    linked += 1;
    // A QR code drawn at build time was read back by both decoders there.
    const pre = await src.prerendered?.(g.file);
    if (pre) {
      if (pre.verified) verified += 1;
      continue;
    }
    const invite = await readInvite(src, g.file).catch(() => null);
    if (!invite) continue;
    const png = await decodePng(new Uint8Array(Buffer.from(invite.qr.split(",")[1] ?? "", "base64")));
    const w = invite.width;
    if (decodesTo(invite.url, resizeRGBA(png.data, png.width, png.height, w, w), w, w)) verified += 1;
  }
  return { groups: WHATSAPP_GROUPS.length, found, linked, logos, verified };
}
