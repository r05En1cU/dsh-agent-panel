/**
 * dsh-plugin-agent-team-panel — host half.
 *
 * Registers only exact owner routes that call the native Agent Team service
 * (ctx.agentTeams) with the caller's exact live Agent. It stores no Team
 * state; the browser reads the native
 * agentTeam projection directly.
 */
import { registerAgentTeamPanelRoutes } from './src/host-routes.mjs';

export const name = 'agent-team-panel';

/** Native Team service and Agent lookup are required; connection is optional. */
export const inject = ['agentTeams', 'agents'];

export function apply(ctx) {
  const log = (level, message) => {
    try {
      if (ctx && ctx.logger && typeof ctx.logger[level] === 'function') ctx.logger[level]('[agent-team-panel] ' + message);
    } catch {
      /* logging must not affect boot */
    }
  };
  const deps = {
    agentTeams: ctx.agentTeams,
    agents: ctx.agents,
    log,
  };
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['connection'], (scope) => {
        try {
          const result = registerAgentTeamPanelRoutes(scope, deps, { log });
          if (result.registered) log('info', 'owner routes registered: ' + result.paths.join(', '));
          else log('info', 'owner routes skipped: ' + String(result.reason || 'unavailable'));
        } catch (error) {
          log('warn', 'owner route registration failed: ' + String(error && error.message ? error.message : error));
        }
      });
    } catch (error) {
      log('warn', 'connection injection failed: ' + String(error && error.message ? error.message : error));
    }
  }
}
