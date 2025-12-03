import type { Browser, BrowserContext } from "patchright";
import { chromium } from "patchright";
import { CONFIG } from "../config.js";
import { log } from "../utils/logger.js";

export interface RemoteDiagnostics {
  connected: boolean;
  host: string;
  port: number;
  secure: boolean;
  lastConnectedAt?: number | null;
  lastError?: string | null;
  wsEndpoint?: string | null;
}

/**
 * SharedContextManager now connects to a remote Chrome instance via CDP rather
 * than spawning a local Chromium profile. This enables the MCP server to run
 * inside WSL1 while driving the Chrome window that lives on the Windows host
 * (or a Hyper-V VM).
 */
export class SharedContextManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private connecting: Promise<void> | null = null;
  private lastError: string | null = null;
  private lastConnectedAt: number | null = null;
  private lastWsEndpoint: string | null = null;

  async getOrCreateContext(): Promise<BrowserContext> {
    if (this.context) {
      try {
        await this.context.pages();
        return this.context;
      } catch {
        this.context = null;
        this.browser = null;
      }
    }

    if (!this.connecting) {
      this.connecting = this.connect();
    }

    await this.connecting;
    this.connecting = null;

    if (!this.context) {
      throw new Error("Failed to connect to remote Chrome instance");
    }

    return this.context;
  }

  /**
   * Close our CDP connection without shutting down the host Chrome instance.
   */
  async closeContext(): Promise<void> {
    this.context = null;

    if (this.browser) {
      try {
        // Disconnect without closing the actual Chrome instance.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyBrowser = this.browser as any;
        if (typeof anyBrowser._connection?.close === "function") {
          await anyBrowser._connection.close();
        }
      } catch {
        // ignore disconnect errors
      } finally {
        this.browser = null;
      }
    }
  }

  /**
   * Returns cached diagnostics about the remote connection.
   */
  getDiagnostics(): RemoteDiagnostics {
    return {
      connected: !!this.browser && !!this.context,
      host: CONFIG.remoteChromeHost,
      port: CONFIG.remoteChromePort,
      secure: CONFIG.remoteChromeSecure,
      lastConnectedAt: this.lastConnectedAt,
      lastError: this.lastError,
      wsEndpoint: this.lastWsEndpoint,
    };
  }

  /**
   * Performs a lightweight HTTP request against the remote debugging endpoint
   * to determine whether Chrome is reachable.
   */
  async checkRemoteAvailability(): Promise<{ reachable: boolean; detail?: string }> {
    const url = this.buildVersionUrl();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.remoteChromeConnectTimeoutMs);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        return { reachable: false, detail: `HTTP ${response.status}` };
      }

      await response.json();
      return { reachable: true };
    } catch (error) {
      return { reachable: false, detail: String(error) };
    }
  }

  private async connect(): Promise<void> {
    try {
      const wsEndpoint = await this.resolveWsEndpoint();
      this.lastWsEndpoint = wsEndpoint;

      log.info(`🌐 Connecting to remote Chrome: ${wsEndpoint}`);
      this.browser = await chromium.connectOverCDP(wsEndpoint);

      const contexts = this.browser.contexts();
      if (contexts.length === 0) {
        throw new Error(
          "Remote Chrome did not expose a default context. Start Chrome with --remote-debugging-port."
        );
      }

      this.context = contexts[0];
      this.context.on("close", () => {
        this.context = null;
      });
      this.browser.on("disconnected", () => {
        this.browser = null;
        this.context = null;
      });

      this.lastConnectedAt = Date.now();
      this.lastError = null;
      log.success("✅ Connected to remote Chrome via CDP");
    } catch (error) {
      this.browser = null;
      this.context = null;
      this.lastError = String(error);
      log.error(`❌ Failed to connect to remote Chrome: ${error}`);
      throw error;
    }
  }

  private async resolveWsEndpoint(): Promise<string> {
    if (CONFIG.remoteChromeWsEndpoint) {
      return this.normalizeWsEndpoint(CONFIG.remoteChromeWsEndpoint);
    }

    const url = this.buildVersionUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.remoteChromeConnectTimeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(
        `Failed to reach remote Chrome at ${url} (HTTP ${response.status}). ` +
        "Ensure Chrome was launched with --remote-debugging-port."
      );
    }

    const data = (await response.json()) as {
      webSocketDebuggerUrl?: string;
      websocketDebuggerUrl?: string;
    };
    const wsUrl = data.webSocketDebuggerUrl || data.websocketDebuggerUrl;
    if (!wsUrl) {
      throw new Error(
        `Remote Chrome at ${url} did not report a webSocketDebuggerUrl field.`
      );
    }

    return this.normalizeWsEndpoint(wsUrl);
  }

  private buildVersionUrl(): string {
    const protocol = CONFIG.remoteChromeSecure ? "https" : "http";
    return `${protocol}://${CONFIG.remoteChromeHost}:${CONFIG.remoteChromePort}/json/version`;
  }

  private normalizeWsEndpoint(raw: string): string {
    try {
      const url = new URL(raw);
      url.protocol = CONFIG.remoteChromeSecure ? "wss:" : "ws:";
      url.hostname = CONFIG.remoteChromeHost;
      url.port = String(CONFIG.remoteChromePort);
      return url.toString();
    } catch {
      // raw might be a bare host:port - rebuild from scratch
      const protocol = CONFIG.remoteChromeSecure ? "wss" : "ws";
      return `${protocol}://${CONFIG.remoteChromeHost}:${CONFIG.remoteChromePort}${raw}`;
    }
  }
}
