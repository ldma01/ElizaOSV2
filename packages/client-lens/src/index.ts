import { type Client, type IAgentRuntime, elizaLogger, type Plugin } from "@elizaos/core";
import { privateKeyToAccount } from "viem/accounts";
import { LensClient } from "./client";
import { LensPostManager } from "./post";
import { LensInteractionManager } from "./interactions";
import StorjProvider from "./providers/StorjProvider";

class LensAgentClient implements Client {
    name = 'lens';

    client: LensClient;
    posts: LensPostManager;
    interactions: LensInteractionManager;

    private profileId: `0x${string}`;
    private ipfs: StorjProvider;

    constructor(public runtime: IAgentRuntime) {
        const cache = new Map<string, any>();

        const privateKey = runtime.getSetting(
            "EVM_PRIVATE_KEY"
        ) as `0x${string}`;
        if (!privateKey) {
            throw new Error("EVM_PRIVATE_KEY is missing");
        }
        const account = privateKeyToAccount(privateKey);

        this.profileId = runtime.getSetting(
            "LENS_PROFILE_ID"
        )! as `0x${string}`;

        this.client = new LensClient({
            runtime: this.runtime,
            account,
            cache,
            profileId: this.profileId,
        });

        elizaLogger.info("Lens client initialized.");

        this.ipfs = new StorjProvider(runtime);

        this.posts = new LensPostManager(
            this.client,
            this.runtime,
            this.profileId,
            cache,
            this.ipfs
        );

        this.interactions = new LensInteractionManager(
            this.client,
            this.runtime,
            this.profileId,
            cache,
            this.ipfs
        );
    }

    async start() {
        await Promise.all([this.posts.start(), this.interactions.start()]);

        return {
            stop: async () => {
                await Promise.all([this.posts.stop(), this.interactions.stop()]);
            },
        };
    }

    static async start(runtime: IAgentRuntime) {
        const client = new LensAgentClient(runtime);
        return await client.start();
    }
}

const lensPlugin: Plugin = {
    name: "lens",
    description: "Lens client plugin",
    clients: [LensAgentClient],
};
export default lensPlugin;
