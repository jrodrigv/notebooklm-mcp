import type { Page } from "patchright";
import { NOTEBOOKLM_AUTH_URL } from "../config.js";
import { log } from "../utils/logger.js";
import type { ProgressCallback } from "../types.js";
import { SharedContextManager } from "../session/shared-context-manager.js";
import { AuthenticationError } from "../errors.js";

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const LOGIN_CHECK_INTERVAL_MS = 2000;
const LOGOUT_URL = "https://accounts.google.com/Logout";

/**
 * Coordinates interactive authentication flows against a remote Chrome instance.
 *
 * Instead of spawning a local Chromium profile, we attach to a Chrome window
 * that is already running on the Windows host (or Hyper-V VM) via CDP. That
 * window is visible to the user, so we simply open a new tab that points to the
 * Google login flow and wait until NotebookLM loads.
 */
export class RemoteAuthCoordinator {
  constructor(private readonly sharedContextManager: SharedContextManager) {}

  /**
   * Launches NotebookLM login in the remote Chrome instance and waits until
   * the user completes authentication manually.
   */
  async runSetup(sendProgress?: ProgressCallback): Promise<void> {
    const page = await this.openLoginPage(sendProgress);

    try {
      await this.waitForNotebookRedirect(page, sendProgress);
    } finally {
      await this.safeClose(page);
    }
  }

  /**
   * Signs out the current Google session (if any) then re-runs the setup flow.
   */
  async runReAuth(sendProgress?: ProgressCallback): Promise<void> {
    const page = await this.openLoginPage(sendProgress);

    try {
      await sendProgress?.("Signing out of the current Google session...", 2, 10);
      try {
        await page.goto(LOGOUT_URL, { waitUntil: "load", timeout: 60000 });
        log.info("🔐 Google logout page loaded");
      } catch (error) {
        log.warning(`⚠️  Failed to reach logout page: ${error}`);
      }

      await sendProgress?.("Reloading NotebookLM login...", 3, 10);
      await page.goto(NOTEBOOKLM_AUTH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

      await this.waitForNotebookRedirect(page, sendProgress);
    } finally {
      await this.safeClose(page);
    }
  }

  /**
   * Opens the Google login page inside the shared remote Chrome context.
   */
  private async openLoginPage(sendProgress?: ProgressCallback): Promise<Page> {
    await sendProgress?.("Connecting to remote Chrome...", 1, 10);
    const context = await this.sharedContextManager.getOrCreateContext();

    const page = await context.newPage();
    log.info("🌐 Opening Google login flow inside remote Chrome instance...");

    await sendProgress?.("Loading Google login page...", 2, 10);
    await page.goto(NOTEBOOKLM_AUTH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

    log.info("✅ Login page ready in remote Chrome. Complete the flow on the Windows desktop.");
    await sendProgress?.(
      "Login page ready. Complete the flow in the Windows Chrome window.",
      3,
      10
    );

    return page;
  }

  /**
   * Waits until NotebookLM loads, indicating a successful login.
   */
  private async waitForNotebookRedirect(page: Page, sendProgress?: ProgressCallback): Promise<void> {
    const start = Date.now();
    let lastProgress = 0;

    log.info("⏳ Waiting for NotebookLM to load (up to 10 minutes)...");
    await sendProgress?.("Waiting for manual login to finish...", 4, 10);

    while (Date.now() - start < LOGIN_TIMEOUT_MS) {
      const currentUrl = page.url();

      if (currentUrl.startsWith("https://notebooklm.google.com/")) {
        log.success("✅ NotebookLM detected. Authentication complete.");
        await sendProgress?.("NotebookLM detected – authentication complete!", 10, 10);
        return;
      }

      const elapsedSeconds = Math.floor((Date.now() - start) / 1000);
      if (elapsedSeconds - lastProgress >= 15) {
        lastProgress = elapsedSeconds;
        await sendProgress?.(
          `Still waiting for login... (${elapsedSeconds}s elapsed)`,
          Math.min(9, 4 + Math.floor(elapsedSeconds / 30)),
          10
        );
        log.info(`  ...still waiting (${elapsedSeconds}s). Current URL: ${currentUrl}`);
      }

      await page.waitForTimeout(LOGIN_CHECK_INTERVAL_MS);
    }

    throw new AuthenticationError(
      "Timed out waiting for NotebookLM after launching the login flow in remote Chrome."
    );
  }

  private async safeClose(page: Page): Promise<void> {
    try {
      await page.close();
    } catch {
      // ignore close errors – remote Chrome may already have the tab closed manually
    }
  }
}
