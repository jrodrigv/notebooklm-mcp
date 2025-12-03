## Configuration

**No config files needed!** The server works out of the box with sensible defaults.

### Configuration Priority (highest to lowest):
1. **Tool Parameters** - Claude passes settings like `browser_options` at runtime
2. **Environment Variables** - Optional overrides for advanced users
3. **Hardcoded Defaults** - Sensible defaults that work for most users

---

## Tool Parameters (Runtime Configuration)

Claude can control browser behavior via the `browser_options` parameter in tools like `ask_question`, `setup_auth`, and `re_auth`:

```typescript
browser_options: {
  show: boolean,              // Legacy flag (ignored in remote mode)
  headless: boolean,          // Legacy flag (ignored in remote mode)
  timeout_ms: number,         // Browser timeout in ms (default: 30000)

  stealth: {
    enabled: boolean,         // Master switch (default: true)
    random_delays: boolean,   // Random delays between actions (default: true)
    human_typing: boolean,    // Human-like typing (default: true)
    mouse_movements: boolean, // Realistic mouse movements (default: true)
    typing_wpm_min: number,   // Min typing speed (default: 160)
    typing_wpm_max: number,   // Max typing speed (default: 240)
    delay_min_ms: number,     // Min delay between actions (default: 100)
    delay_max_ms: number,     // Max delay between actions (default: 400)
  },

  viewport: {
    width: number,            // Viewport width (default: 1024)
    height: number,           // Viewport height (default: 768)
  }
}
```

> ⚠️ In the WSL1 remote build, `show` and `headless` no longer affect visibility. Chrome always runs on Windows; these flags are only kept for backwards compatibility.

**Example usage:**
- "Use slow typing for this query" → Adjusts typing WPM via stealth settings

---

## Environment Variables (Optional)

For advanced users who want to set global defaults:
- Remote Chrome (Windows / Hyper-V host)
  - `REMOTE_CHROME_HOST` — host/IP of the Chrome instance (default `127.0.0.1` for WSL1)
  - `REMOTE_CHROME_PORT` — remote debugging port (default `9222`)
  - `REMOTE_CHROME_SECURE` — `true|false` (default `false`, set `true` for TLS tunnels)
  - `REMOTE_CHROME_WS_ENDPOINT` — optional full WebSocket URL if you proxy Chrome
  - `REMOTE_CHROME_CONNECT_TIMEOUT_MS` — timeout for connectivity checks (default `15000`)
  - `WSL_HOST_IP` — optional helper env that overrides the default host value
- Stealth / Human-like behavior
  - `STEALTH_ENABLED` — `true|false` (default `true`) — Master switch for all stealth features
  - `STEALTH_RANDOM_DELAYS` — `true|false` (default `true`)
  - `STEALTH_HUMAN_TYPING` — `true|false` (default `true`)
  - `STEALTH_MOUSE_MOVEMENTS` — `true|false` (default `true`)
- Typing speed (human‑like)
  - `TYPING_WPM_MIN` (default 160), `TYPING_WPM_MAX` (default 240)
- Delays (human‑like)
  - `MIN_DELAY_MS` (default 100), `MAX_DELAY_MS` (default 400)
- Browser timing
  - `BROWSER_TIMEOUT` (ms, default `30000`)
- Sessions
  - `MAX_SESSIONS` (default 10), `SESSION_TIMEOUT` (s, default 900)
- Library metadata (optional hints)
  - `NOTEBOOK_DESCRIPTION`, `NOTEBOOK_TOPICS`, `NOTEBOOK_CONTENT_TYPES`, `NOTEBOOK_USE_CASES`
  - `NOTEBOOK_URL` — optional; leave empty and manage notebooks via the library

---

## Storage Paths

The server uses platform-specific paths via [env-paths](https://github.com/sindresorhus/env-paths)
- **Linux**: `~/.local/share/notebooklm-mcp/`
- **macOS**: `~/Library/Application Support/notebooklm-mcp/`
- **Windows**: `%LOCALAPPDATA%\notebooklm-mcp\`

**What's stored:**
- `library.json` - Your notebook library with metadata
- Lightweight cache/log directories

Chrome profiles remain on Windows; WSL no longer stores any browser data locally.

**No config.json file** - Configuration is purely via environment variables or tool parameters!

