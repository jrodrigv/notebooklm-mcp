import test from "node:test";
import assert from "node:assert/strict";

import { ToolHandlers } from "../src/tools/handlers.js";
import { CONFIG } from "../src/config.js";
import type { SessionManager } from "../src/session/session-manager.js";
import type { RemoteAuthCoordinator } from "../src/auth/remote-auth-coordinator.js";
import type { NotebookLibrary } from "../src/library/notebook-library.js";
import type { RemoteDiagnostics } from "../src/session/shared-context-manager.js";

class FakeSessionManager {
  public availability = { reachable: true as boolean, detail: undefined as string | undefined };
  public markAuthenticatedCalls = 0;
  public resetAuthCalls = 0;
  public closeAllSessionsCalls = 0;
  public checkRemoteAvailabilityCalls = 0;

  async checkRemoteAvailability() {
    this.checkRemoteAvailabilityCalls++;
    return this.availability;
  }

  markAuthenticated() {
    this.markAuthenticatedCalls++;
  }

  resetAuthConfirmation() {
    this.resetAuthCalls++;
  }

  async closeAllSessions() {
    this.closeAllSessionsCalls++;
  }

  getStats() {
    return {
      active_sessions: 0,
      max_sessions: 10,
      session_timeout: 900,
      oldest_session_seconds: 0,
      total_messages: 0,
    };
  }

  getConnectionDiagnostics(): RemoteDiagnostics {
    return {
      connected: this.availability.reachable,
      host: CONFIG.remoteChromeHost,
      port: CONFIG.remoteChromePort,
      secure: CONFIG.remoteChromeSecure,
      lastConnectedAt: Date.now(),
      lastError: null,
      wsEndpoint: null,
    };
  }

  hasConfirmedAuthentication(): boolean {
    return this.markAuthenticatedCalls > 0;
  }
}

class FakeRemoteAuth {
  public setupCalls = 0;
  public reauthCalls = 0;

  async runSetup() {
    this.setupCalls++;
  }

  async runReAuth() {
    this.reauthCalls++;
  }
}

function createHandlerFixture() {
  const session = new FakeSessionManager();
  const remote = new FakeRemoteAuth();
  const handlers = new ToolHandlers(
    session as unknown as SessionManager,
    remote as unknown as RemoteAuthCoordinator,
    {} as NotebookLibrary
  );
  return { session, remote, handlers };
}

test("setup_auth happy path triggers remote Chrome workflow", async () => {
  const { session, remote, handlers } = createHandlerFixture();
  const progress: string[] = [];
  const originalConfig = { ...CONFIG };

  try {
    const result = await handlers.handleSetupAuth(
      { show_browser: true },
      (message) => progress.push(message)
    );

    assert.ok(result.success, "setup_auth should succeed when remote Chrome is reachable");
    assert.equal(remote.setupCalls, 1, "remote auth flow should run exactly once");
    assert.equal(session.markAuthenticatedCalls, 1, "session manager should be marked authenticated");
    assert.ok(
      progress.some((msg) => msg.includes("Authentication complete")),
      "should emit completion progress update"
    );
  } finally {
    Object.assign(CONFIG, originalConfig);
  }
});

test("re_auth happy path closes sessions and re-launches remote Chrome auth", async () => {
  const { session, remote, handlers } = createHandlerFixture();
  const progress: string[] = [];
  const originalConfig = { ...CONFIG };

  try {
    const result = await handlers.handleReAuth({}, (message) => progress.push(message));

    assert.ok(result.success, "re_auth should succeed when remote Chrome is reachable");
    assert.equal(session.closeAllSessionsCalls, 1, "all sessions should be closed before re-auth");
    assert.equal(session.resetAuthCalls, 1, "session auth confirmation should be reset");
    assert.equal(remote.reauthCalls, 1, "remote re-auth flow should run once");
    assert.equal(session.markAuthenticatedCalls, 1, "session manager should be re-marked authenticated");
    assert.ok(
      progress.some((msg) => msg.includes("Re-authentication complete")),
      "should emit completion progress update"
    );
  } finally {
    Object.assign(CONFIG, originalConfig);
  }
});
