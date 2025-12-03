## Troubleshooting

### Fresh start / Deep cleanup
If you're experiencing persistent issues or just want to tidy up the WSL installation:

**Recommended workflow:**
1. Leave the Windows Chrome window open (or restart it with `--remote-debugging-port=9222`).
2. Ask: "Run NotebookLM cleanup and preserve my library".
3. Review the preview to see which WSL files will be removed (library is kept when preserving).
4. Confirm deletion if everything looks good.
5. Run `setup_auth` to open a new login tab inside the Windows Chrome window.

**What gets cleaned (WSL side only):**
- MCP caches/logs
- Old notebooks metadata
- Temporary files
- **Preserved:** `library.json` when using `preserve_library=true`

Browser profiles now live entirely on Windows, so cleanup never touches your host Chrome profile.

### Browser closed / `newPage` errors
- Symptom: `browserContext.newPage: Target page/context/browser has been closed`.
- Fix: The server auto‑recovers (recreates context and page). Re‑run the tool.

### Remote Chrome unreachable / `ECONNREFUSED`
- Symptom: `get_health` shows `remote_chrome.reachable=false`, or tools return `Failed to connect to remote Chrome`.
- Fix:
  1. Start Chrome on Windows with `--remote-debugging-port=9222` (and leave it running).
  2. Ensure WSL1 can reach the host: `curl http://127.0.0.1:9222/json/version` should return JSON.
  3. Set `REMOTE_CHROME_HOST`/`REMOTE_CHROME_PORT` if you use a custom port or Hyper-V VM.
  4. Re-run `setup_auth` once the connection is reachable.

### Authentication issues
**Quick fix:** Ask the agent to repair authentication; it will run `get_health` → `setup_auth` → `get_health`. The Windows Chrome tab opens for manual login.

**For persistent auth failures:**
1. Restart Chrome on Windows with `--remote-debugging-port=9222` (use a fresh profile if needed).
2. In WSL, run cleanup with library preservation (optional, WSL-only).
3. Run `setup_auth` to launch a new login tab in the Windows Chrome window.
4. Complete Google login in that tab; the MCP server automatically detects NotebookLM.

### Typing speed too slow/fast
- Adjust `TYPING_WPM_MIN`/`MAX`; or disable stealth typing by setting `STEALTH_ENABLED=false`.

### Rate limit reached
- Symptom: "NotebookLM rate limit reached (50 queries/day for free accounts)".
- Fix: Use `re_auth` tool to switch to a different Google account, or wait until tomorrow.
- Upgrade: Google AI Pro/Ultra gives 5x higher limits.

### No notebooks found
- Ask to add the NotebookLM link you need.
- Ask to list the stored notebooks, then choose the one to activate.
