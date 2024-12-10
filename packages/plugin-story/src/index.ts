export * from "./actions/registerIP";
export * from "./actions/licenseIP";
export * from "./providers/wallet";
export * from "./types";

import type { Plugin } from "@ai16z/eliza";
import { storyWalletProvider } from "./providers/wallet";
import { registerIPAction } from "./actions/registerIP";
import { licenseIPAction } from "./actions/licenseIP";

export const storyPlugin: Plugin = {
    name: "story",
    description: "Story integration plugin",
    providers: [storyWalletProvider],
    evaluators: [],
    services: [],
    actions: [registerIPAction, licenseIPAction],
};

export default storyPlugin;
