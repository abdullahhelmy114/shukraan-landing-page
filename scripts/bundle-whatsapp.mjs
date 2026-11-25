// Builds src/lib/generated/whatsapp-bundle.json from whatsapp-gruplari/ (each group's link file and
// logo) so the server never reads that folder at run time: Cloudflare Workers have no file system.
// The QR codes (with each group's logo) are drawn here too, by the server's own code
// (src/lib/whatsapp-invites.ts, bundled with esbuild) and checked with two QR decoders, so a request
// never spends CPU time on them (Workers limit CPU time per request). The output holds the private
// WhatsApp links: it is git-ignored, written at build time (`bun run build`, the Dockerfile,
// `bun run cf:build`) and before the tests (bunfig.toml). Prints counts only, never a link.
//
// Usage: node scripts/bundle-whatsapp.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = path.join(ROOT, "src/lib/generated/whatsapp-bundle.json");
const DIR = path.join(ROOT, "whatsapp-gruplari");
const COMMUNITY = ["normal-kadin", "normal-erkek", "yogun-kadin", "yogun-erkek"];

/** The four community groups' files, then any group's own (<group id>.txt) added to the folder since. */
export function filesIn(dir = DIR) {
  const own = existsSync(dir) ? readdirSync(dir).filter((n) => /^[a-z0-9-]+\.txt$/.test(n)).map((n) => n.slice(0, -4)) : [];
  return [...new Set([...COMMUNITY, ...own])];
}

/** { <file>: { text, logo } } from a whatsapp-gruplari folder (missing files are null). */
export function bundleWhatsapp(dir = DIR) {
  const out = {};
  for (const file of filesIn(dir)) {
    const txt = path.join(dir, `${file}.txt`);
    const png = path.join(dir, "logolar", `${file}.png`);
    out[file] = {
      text: existsSync(txt) ? readFileSync(txt, "utf8") : null,
      logo: existsSync(png) ? readFileSync(png).toString("base64") : null,
    };
  }
  return out;
}

/**
 * Adds each group's finished QR code (qr, width) to the bundle, drawn by the server's own code and
 * read back by jsQR and ZXing (verified). Returns how many were drawn and verified; 0 when esbuild is
 * not installed (the server then draws them itself).
 */
export async function prerenderQr(bundle, dir = DIR) {
  let esbuild;
  try {
    esbuild = await import("esbuild");
  } catch {
    return { drawn: 0, verified: 0 };
  }
  const tmp = path.join(tmpdir(), `whatsapp-qr-${process.pid}-${Date.now()}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(ROOT, "src/lib/whatsapp-invites.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: tmp,
    tsconfig: path.join(ROOT, "tsconfig.json"),
    logLevel: "silent",
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  try {
    const mod = await import(pathToFileURL(tmp).href);
    const { PNG } = (await import("pngjs")).default ?? (await import("pngjs"));
    let drawn = 0;
    let verified = 0;
    for (const file of Object.keys(bundle)) {
      const invite = await mod.readInvite(mod.folderSource(dir), file);
      if (!invite) continue;
      drawn += 1;
      const png = PNG.sync.read(Buffer.from(invite.qr.split(",")[1], "base64"));
      const ok = [invite.width, Math.round(invite.width / 2)].every((w) => mod.decodesTo(invite.url, mod.resizeRGBA(png.data, png.width, png.height, w, w), w, w));
      if (ok) verified += 1;
      bundle[file] = { ...bundle[file], qr: invite.qr, width: invite.width, verified: ok };
    }
    return { drawn, verified };
  } finally {
    rmSync(tmp, { force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const bundle = bundleWhatsapp();
  mkdirSync(path.dirname(OUT), { recursive: true });
  // Written first without QR codes: the server code drawing them imports this file.
  writeFileSync(OUT, JSON.stringify(bundle));
  const { drawn, verified } = await prerenderQr(bundle);
  writeFileSync(OUT, JSON.stringify(bundle));
  const groups = Object.values(bundle);
  console.log(
    `[whatsapp-gruplari] bundled ${groups.filter((g) => g.text !== null).length}/${groups.length} link files, ${groups.filter((g) => g.logo).length} logos, ${drawn} QR codes drawn, ${verified} read back by both decoders`,
  );
}
