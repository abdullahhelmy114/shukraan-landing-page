/** Runs once when the server starts: reports the WhatsApp group data and whether DATA_DIR can be written. */
export async function register() {
  if (process.env["NEXT_RUNTIME"] === "nodejs") {
    const { logDataDir, logInvitesFolder } = await import("./instrumentation-node");
    await logDataDir();
    await logInvitesFolder();
  }
}
