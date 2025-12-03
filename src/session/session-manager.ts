/**
 * Session Manager
 *
 * Manages multiple parallel browser sessions for NotebookLM API
 *
 * Features:
 * - Session lifecycle management
 * - Auto-cleanup of inactive sessions
 * - Resource limits (max concurrent sessions)
 * - Shared remote Chrome connection via CDP
 */

import { BrowserSession } from "./browser-session.js";
import { SharedContextManager, type RemoteDiagnostics } from "./shared-context-manager.js";
import { CONFIG } from "../config.js";
import { log } from "../utils/logger.js";
import type { SessionInfo } from "../types.js";
import { randomBytes } from "crypto";

export class SessionManager {
  private sessions: Map<string, BrowserSession> = new Map();
  private maxSessions: number;
  private sessionTimeout: number;
  private cleanupInterval?: NodeJS.Timeout;
  private authConfirmed: boolean = false;

  constructor(private readonly sharedContextManager: SharedContextManager) {
    this.maxSessions = CONFIG.maxSessions;
    this.sessionTimeout = CONFIG.sessionTimeout;

    log.info("🎯 SessionManager initialized");
    log.info(`  Max sessions: ${this.maxSessions}`);
    log.info(
      `  Timeout: ${this.sessionTimeout}s (${Math.floor(this.sessionTimeout / 60)} minutes)`
    );

    const cleanupIntervalSeconds = Math.max(
      60,
      Math.min(Math.floor(this.sessionTimeout / 2), 300)
    );
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions().catch((error) => {
        log.warning(`⚠️  Error during automatic session cleanup: ${error}`);
      });
    }, cleanupIntervalSeconds * 1000);
    this.cleanupInterval.unref();
  }

  private generateSessionId(): string {
    return randomBytes(4).toString("hex");
  }

  async getOrCreateSession(
    sessionId?: string,
    notebookUrl?: string
  ): Promise<BrowserSession> {
    const targetUrl = (notebookUrl || CONFIG.notebookUrl || "").trim();
    if (!targetUrl) {
      throw new Error("Notebook URL is required to create a session");
    }
    if (!targetUrl.startsWith("http")) {
      throw new Error("Notebook URL must be an absolute URL");
    }

    if (!sessionId) {
      sessionId = this.generateSessionId();
      log.info(`🆕 Auto-generated session ID: ${sessionId}`);
    }

    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      if (session.notebookUrl !== targetUrl) {
        log.warning(`♻️  Replacing session ${sessionId} with new notebook URL`);
        await session.close();
        this.sessions.delete(sessionId);
      } else {
        session.updateActivity();
        log.success(`♻️  Reusing existing session ${sessionId}`);
        return session;
      }
    }

    if (this.sessions.size >= this.maxSessions) {
      log.warning(`⚠️  Max sessions (${this.maxSessions}) reached, cleaning up...`);
      const freed = await this.cleanupOldestSession();
      if (!freed) {
        throw new Error(
          `Max sessions (${this.maxSessions}) reached and no inactive sessions to clean up`
        );
      }
    }

    log.info(`🆕 Creating new session ${sessionId}...`);
    try {
      await this.sharedContextManager.getOrCreateContext();

      const session = new BrowserSession(
        sessionId,
        this.sharedContextManager,
        () => this.markAuthenticated(),
        targetUrl
      );
      await session.init();

      this.sessions.set(sessionId, session);
      log.success(
        `✅ Session ${sessionId} created (${this.sessions.size}/${this.maxSessions} active)`
      );
      return session;
    } catch (error) {
      log.error(`❌ Failed to create session: ${error}`);
      throw error;
    }
  }

  getSession(sessionId: string): BrowserSession | null {
    return this.sessions.get(sessionId) || null;
  }

  async closeSession(sessionId: string): Promise<boolean> {
    if (!this.sessions.has(sessionId)) {
      log.warning(`⚠️  Session ${sessionId} not found`);
      return false;
    }

    const session = this.sessions.get(sessionId)!;
    await session.close();
    this.sessions.delete(sessionId);

    log.success(
      `✅ Session ${sessionId} closed (${this.sessions.size}/${this.maxSessions} active)`
    );
    return true;
  }

  async closeSessionsForNotebook(url: string): Promise<number> {
    let closed = 0;

    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
      if (session.notebookUrl === url) {
        try {
          await session.close();
        } catch (error) {
          log.warning(`  ⚠️  Error closing ${sessionId}: ${error}`);
        } finally {
          this.sessions.delete(sessionId);
          closed++;
        }
      }
    }

    if (closed > 0) {
      log.warning(
        `🧹 Closed ${closed} session(s) using removed notebook (${this.sessions.size}/${this.maxSessions} active)`
      );
    }

    return closed;
  }

  async cleanupInactiveSessions(): Promise<number> {
    const inactiveSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.isExpired(this.sessionTimeout)) {
        inactiveSessions.push(sessionId);
      }
    }

    if (inactiveSessions.length === 0) {
      return 0;
    }

    log.warning(`🧹 Cleaning up ${inactiveSessions.length} inactive sessions...`);

    for (const sessionId of inactiveSessions) {
      try {
        const session = this.sessions.get(sessionId)!;
        const age = (Date.now() - session.createdAt) / 1000;
        const inactive = (Date.now() - session.lastActivity) / 1000;

        log.warning(
          `  🗑️  ${sessionId}: age=${age.toFixed(0)}s, inactive=${inactive.toFixed(0)}s, messages=${session.messageCount}`
        );

        await session.close();
        this.sessions.delete(sessionId);
      } catch (error) {
        log.warning(`  ⚠️  Error cleaning up ${sessionId}: ${error}`);
      }
    }

    log.success(
      `✅ Cleaned up ${inactiveSessions.length} sessions (${this.sessions.size}/${this.maxSessions} active)`
    );
    return inactiveSessions.length;
  }

  private async cleanupOldestSession(): Promise<boolean> {
    if (this.sessions.size === 0) {
      return false;
    }

    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.createdAt < oldestTime) {
        oldestTime = session.createdAt;
        oldestId = sessionId;
      }
    }

    if (!oldestId) {
      return false;
    }

    const oldestSession = this.sessions.get(oldestId)!;
    const age = (Date.now() - oldestSession.createdAt) / 1000;
    log.warning(`🗑️  Removing oldest session ${oldestId} (age: ${age.toFixed(0)}s)`);

    await oldestSession.close();
    this.sessions.delete(oldestId);

    return true;
  }

  async closeAllSessions(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    if (this.sessions.size === 0) {
      log.warning("🛑 Closing shared context (no active sessions)...");
      await this.sharedContextManager.closeContext();
      log.success("✅ All sessions closed");
      return;
    }

    log.warning(`🛑 Closing all ${this.sessions.size} sessions...`);

    for (const sessionId of Array.from(this.sessions.keys())) {
      try {
        const session = this.sessions.get(sessionId)!;
        await session.close();
        this.sessions.delete(sessionId);
      } catch (error) {
        log.warning(`  ⚠️  Error closing ${sessionId}: ${error}`);
      }
    }

    await this.sharedContextManager.closeContext();
    log.success("✅ All sessions closed");
  }

  getAllSessionsInfo(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((session) => session.getInfo());
  }

  getStats(): {
    active_sessions: number;
    max_sessions: number;
    session_timeout: number;
    oldest_session_seconds: number;
    total_messages: number;
  } {
    const sessionsInfo = this.getAllSessionsInfo();

    const totalMessages = sessionsInfo.reduce(
      (sum, info) => sum + info.message_count,
      0
    );
    const oldestSessionSeconds = Math.max(
      ...sessionsInfo.map((info) => info.age_seconds),
      0
    );

    return {
      active_sessions: sessionsInfo.length,
      max_sessions: this.maxSessions,
      session_timeout: this.sessionTimeout,
      oldest_session_seconds: oldestSessionSeconds,
      total_messages: totalMessages,
    };
  }

  markAuthenticated(): void {
    this.authConfirmed = true;
  }

  resetAuthConfirmation(): void {
    this.authConfirmed = false;
  }

  hasConfirmedAuthentication(): boolean {
    return this.authConfirmed;
  }

  getConnectionDiagnostics(): RemoteDiagnostics {
    return this.sharedContextManager.getDiagnostics();
  }

  async checkRemoteAvailability(): Promise<{ reachable: boolean; detail?: string }> {
    return this.sharedContextManager.checkRemoteAvailability();
  }
}
