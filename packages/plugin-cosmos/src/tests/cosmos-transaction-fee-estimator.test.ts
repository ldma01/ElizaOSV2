import { describe, it, expect, vi, beforeEach } from "vitest";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { CosmosTransactionFeeEstimator } from "../shared/services/cosmos-transaction-fee-estimator";

vi.mock("@cosmjs/cosmwasm-stargate", () => ({
    SigningCosmWasmClient: {
        simulate: vi.fn(),
    },
}));

describe("FeeEstimator", () => {
    let mockSigningCosmWasmClient: SigningCosmWasmClient;

    beforeEach(() => {
        mockSigningCosmWasmClient = {
            simulate: vi.fn(),
        } as unknown as SigningCosmWasmClient;

        vi.clearAllMocks();
    });

    it("should estimate gas for sending tokens successfully", async () => {
        const mockGasEstimation = 200000;

        // @ts-expect-error -- ...
        (mockSigningCosmWasmClient.simulate as vi.Mock).mockResolvedValue(
            mockGasEstimation
        );

        const senderAddress = "cosmos1senderaddress";
        const recipientAddress = "cosmos1recipientaddress";
        const amount = [{ denom: "uatom", amount: "1000000" }];
        const memo = "Test memo";

        const estimatedGas =
            await CosmosTransactionFeeEstimator.estimateGasForCoinTransfer(
                mockSigningCosmWasmClient,
                senderAddress,
                recipientAddress,
                amount,
                memo
            );

        expect(estimatedGas).toBe(mockGasEstimation);
        expect(mockSigningCosmWasmClient.simulate).toHaveBeenCalledWith(
            senderAddress,
            [
                {
                    typeUrl: "/cosmos.bank.v1beta1.MsgSend",
                    value: {
                        fromAddress: senderAddress,
                        toAddress: recipientAddress,
                        amount: [...amount],
                    },
                },
            ],
            memo
        );
    });

    it("should throw an error if gas estimation fails", async () => {
        // @ts-expect-error -- ...
        (mockSigningCosmWasmClient.simulate as vi.Mock).mockRejectedValue(
            new Error("Gas estimation failed")
        );

        const senderAddress = "cosmos1senderaddress";
        const recipientAddress = "cosmos1recipientaddress";
        const amount = [{ denom: "uatom", amount: "1000000" }];

        await expect(
            CosmosTransactionFeeEstimator.estimateGasForCoinTransfer(
                mockSigningCosmWasmClient,
                senderAddress,
                recipientAddress,
                amount
            )
        ).rejects.toThrow("Gas estimation failed");

        expect(mockSigningCosmWasmClient.simulate).toHaveBeenCalledWith(
            senderAddress,
            [
                {
                    typeUrl: "/cosmos.bank.v1beta1.MsgSend",
                    value: {
                        fromAddress: senderAddress,
                        toAddress: recipientAddress,
                        amount: [...amount],
                    },
                },
            ],
            ""
        );
    });
});
