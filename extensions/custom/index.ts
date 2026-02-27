import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createCustomChannelPlugin } from "./src/channel.js";
import { setCustomRuntime } from "./src/runtime.js";

const plugin = {
  id: "openclaw-custom-channel",
  name: "Custom",
  description: "Custom channel plugin for OpenClaw - webhook-based chat and group chat",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setCustomRuntime(api.runtime);
    api.registerChannel({ plugin: createCustomChannelPlugin() });
  },
};

export default plugin;
