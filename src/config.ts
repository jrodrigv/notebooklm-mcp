/**
 * Configuration for NotebookLM MCP Server
 *
 * Config Priority (highest to lowest):
 * 1. Hardcoded Defaults (works out of the box!)
 * 2. Environment Variables (optional, for advanced users)
 * 3. Tool Parameters (passed by Claude at runtime)
 *
 * No config.json file needed - all settings via ENV or tool parameters!
 */

import envPaths from "env-paths";
import fs from "fs";

// Cross-platform data paths (unified without -nodejs suffix)
// Linux: ~/.local/share/notebooklm-mcp/
// macOS: ~/Library/Application Support/notebooklm-mcp/
// Windows: %APPDATA%\notebooklm-mcp\
// IMPORTANT: Pass empty string suffix to disable envPaths' default '-nodejs' suffix!
const paths = envPaths("notebooklm-mcp", {suffix: ""});

/**
 * Google NotebookLM Auth URL (used by setup_auth)
 * This is the base Google login URL that redirects to NotebookLM
 */
export const NOTEBOOKLM_AUTH_URL =
  "https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fnotebooklm.google.com%2F&flowName=GlifWebSignIn&flowEntry=ServiceLogin";

export interface Config {
  // NotebookLM - optional, used for legacy default notebook
  notebookUrl: string;

  // Remote Chrome connection (Windows host / Hyper-V VM)
  remoteChromeHost: string;
  remoteChromePort: number;
  remoteChromeSecure: boolean;
  remoteChromeWsEndpoint?: string;
  remoteChromeConnectTimeoutMs: number;

  // Browser Settings (apply to automation behavior inside remote Chrome)
  headless: boolean;
  browserTimeout: number;
  viewport: { width: number; height: number };

  // Session Management
  maxSessions: number;
  sessionTimeout: number; // in seconds

  // Authentication
  // Stealth Settings
  stealthEnabled: boolean;
  stealthRandomDelays: boolean;
  stealthHumanTyping: boolean;
  stealthMouseMovements: boolean;
  typingWpmMin: number;
  typingWpmMax: number;
  minDelayMs: number;
  maxDelayMs: number;

  // Paths
  configDir: string;
  dataDir: string;

  // Library Configuration (optional, for default notebook metadata)
  notebookDescription: string;
  notebookTopics: string[];
  notebookContentTypes: string[];
  notebookUseCases: string[];

}

/**
 * Default Configuration (works out of the box!)
 */
const DEFAULTS: Config = {
  // NotebookLM
  notebookUrl: "",

  // Remote Chrome connection
  remoteChromeHost: process.env.WSL_HOST_IP || "127.0.0.1",
  remoteChromePort: 9222,
  remoteChromeSecure: false,
  remoteChromeWsEndpoint: process.env.REMOTE_CHROME_WS_ENDPOINT,
  remoteChromeConnectTimeoutMs: 15000,

  // Browser Settings
  headless: true,
  browserTimeout: 30000,
  viewport: { width: 1024, height: 768 },

  // Session Management
  maxSessions: 10,
  sessionTimeout: 900, // 15 minutes

  // Stealth Settings
  stealthEnabled: true,
  stealthRandomDelays: true,
  stealthHumanTyping: true,
  stealthMouseMovements: true,
  typingWpmMin: 160,
  typingWpmMax: 240,
  minDelayMs: 100,
  maxDelayMs: 400,

  // Paths (cross-platform via env-paths)
  configDir: paths.config,
  dataDir: paths.data,

  // Library Configuration
  notebookDescription: "General knowledge base",
  notebookTopics: ["General topics"],
  notebookContentTypes: ["documentation", "examples"],
  notebookUseCases: ["General research"],
};


/**
 * Parse boolean from string (for env vars)
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "1") return true;
  if (lower === "false" || lower === "0") return false;
  return defaultValue;
}

/**
 * Parse integer from string (for env vars)
 */
function parseInteger(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse comma-separated array (for env vars)
 */
function parseArray(value: string | undefined, defaultValue: string[]): string[] {
  if (!value) return defaultValue;
  return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Apply environment variable overrides (legacy support)
 */
function applyEnvOverrides(config: Config): Config {
  return {
    ...config,
    // Override with env vars if present
    notebookUrl: process.env.NOTEBOOK_URL || config.notebookUrl,
    remoteChromeHost: process.env.REMOTE_CHROME_HOST || config.remoteChromeHost,
    remoteChromePort: parseInteger(process.env.REMOTE_CHROME_PORT, config.remoteChromePort),
    remoteChromeSecure: parseBoolean(process.env.REMOTE_CHROME_SECURE, config.remoteChromeSecure),
    remoteChromeWsEndpoint: process.env.REMOTE_CHROME_WS_ENDPOINT || config.remoteChromeWsEndpoint,
    remoteChromeConnectTimeoutMs: parseInteger(
      process.env.REMOTE_CHROME_CONNECT_TIMEOUT_MS,
      config.remoteChromeConnectTimeoutMs
    ),
    headless: parseBoolean(process.env.HEADLESS, config.headless),
    browserTimeout: parseInteger(process.env.BROWSER_TIMEOUT, config.browserTimeout),
    maxSessions: parseInteger(process.env.MAX_SESSIONS, config.maxSessions),
    sessionTimeout: parseInteger(process.env.SESSION_TIMEOUT, config.sessionTimeout),
    stealthEnabled: parseBoolean(process.env.STEALTH_ENABLED, config.stealthEnabled),
    stealthRandomDelays: parseBoolean(process.env.STEALTH_RANDOM_DELAYS, config.stealthRandomDelays),
    stealthHumanTyping: parseBoolean(process.env.STEALTH_HUMAN_TYPING, config.stealthHumanTyping),
    stealthMouseMovements: parseBoolean(process.env.STEALTH_MOUSE_MOVEMENTS, config.stealthMouseMovements),
    typingWpmMin: parseInteger(process.env.TYPING_WPM_MIN, config.typingWpmMin),
    typingWpmMax: parseInteger(process.env.TYPING_WPM_MAX, config.typingWpmMax),
    minDelayMs: parseInteger(process.env.MIN_DELAY_MS, config.minDelayMs),
    maxDelayMs: parseInteger(process.env.MAX_DELAY_MS, config.maxDelayMs),
    notebookDescription: process.env.NOTEBOOK_DESCRIPTION || config.notebookDescription,
    notebookTopics: parseArray(process.env.NOTEBOOK_TOPICS, config.notebookTopics),
    notebookContentTypes: parseArray(process.env.NOTEBOOK_CONTENT_TYPES, config.notebookContentTypes),
    notebookUseCases: parseArray(process.env.NOTEBOOK_USE_CASES, config.notebookUseCases),
  };
}

/**
 * Build final configuration
 * Priority: Defaults → Environment Variables → Tool Parameters (at runtime)
 * No config.json files - everything via ENV or tool parameters!
 */
function buildConfig(): Config {
  return applyEnvOverrides(DEFAULTS);
}

/**
 * Global configuration instance
 */
export const CONFIG: Config = buildConfig();

/**
 * Ensure all required directories exist
 * NOTE: We do NOT create configDir - it's not needed!
 */
export function ensureDirectories(): void {
  const dirs = [
    CONFIG.dataDir,
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}


/**
 * Browser options that can be passed via tool parameters
 */
export interface BrowserOptions {
  show?: boolean;
  headless?: boolean;
  timeout_ms?: number;
  stealth?: {
    enabled?: boolean;
    random_delays?: boolean;
    human_typing?: boolean;
    mouse_movements?: boolean;
    typing_wpm_min?: number;
    typing_wpm_max?: number;
    delay_min_ms?: number;
    delay_max_ms?: number;
  };
  viewport?: {
    width?: number;
    height?: number;
  };
}

/**
 * Apply browser options to CONFIG (returns modified copy, doesn't mutate global CONFIG)
 */
export function applyBrowserOptions(
  options?: BrowserOptions,
  legacyShowBrowser?: boolean
): Config {
  const config = { ...CONFIG };

  // Handle legacy show_browser parameter
  if (legacyShowBrowser !== undefined) {
    config.headless = !legacyShowBrowser;
  }

  // Apply browser_options (takes precedence over legacy parameter)
  if (options) {
    if (options.show !== undefined) {
      config.headless = !options.show;
    }
    if (options.headless !== undefined) {
      config.headless = options.headless;
    }
    if (options.timeout_ms !== undefined) {
      config.browserTimeout = options.timeout_ms;
    }
    if (options.stealth) {
      const s = options.stealth;
      if (s.enabled !== undefined) config.stealthEnabled = s.enabled;
      if (s.random_delays !== undefined) config.stealthRandomDelays = s.random_delays;
      if (s.human_typing !== undefined) config.stealthHumanTyping = s.human_typing;
      if (s.mouse_movements !== undefined) config.stealthMouseMovements = s.mouse_movements;
      if (s.typing_wpm_min !== undefined) config.typingWpmMin = s.typing_wpm_min;
      if (s.typing_wpm_max !== undefined) config.typingWpmMax = s.typing_wpm_max;
      if (s.delay_min_ms !== undefined) config.minDelayMs = s.delay_min_ms;
      if (s.delay_max_ms !== undefined) config.maxDelayMs = s.delay_max_ms;
    }
    if (options.viewport) {
      config.viewport = {
        width: options.viewport.width ?? config.viewport.width,
        height: options.viewport.height ?? config.viewport.height,
      };
    }
  }

  return config;
}

// Create directories on import
ensureDirectories();
