/**
 * Plugin runtime singleton.
 * Stores the PluginRuntime from api.runtime (set during register()).
 */

import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setCustomRuntime(r: PluginRuntime): void {
  runtime = r;
}

export function getCustomRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Custom channel runtime not initialized - plugin not registered");
  }
  return runtime;
}
