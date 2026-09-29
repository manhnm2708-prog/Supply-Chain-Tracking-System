import "dotenv/config";
import {
    createPublicClient,
    getAddress,
    http,
    parseAbi,
} from "viem";
import { sepolia } from "viem/chains";
const eventSubscribers = new Set();

export function subscribeToProductEvents(listener) {
    eventSubscribers.add(listener);

    return () => {
        eventSubscribers.delete(listener);
    };
}

const eventAbi = parseAbi([
    "event ProductRegistered(string productId, address indexed manufacturer, uint256 timestamp)",
    "event ProductTransferred(string productId, address indexed from, address indexed to, uint256 timestamp)",
]);

export async function getProductHistory(productId = "SP001") {
    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    const contractAddress = process.env.CONTRACT_ADDRESS;
    const deploymentBlock = process.env.DEPLOYMENT_BLOCK;

    if (!rpcUrl || !contractAddress || !deploymentBlock) {
        throw new Error(
            "Thieu SEPOLIA_RPC_URL, CONTRACT_ADDRESS hoac DEPLOYMENT_BLOCK trong .env",
        );
    }

    if (!/^\d+$/.test(deploymentBlock)) {
        throw new Error("DEPLOYMENT_BLOCK phai la so nguyen khong am.");
    }

    const address = getAddress(contractAddress);
    const startBlock = BigInt(deploymentBlock);

    const client = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl, {
            timeout: 20_000,
            retryCount: 2,
        }),
    });

    if ((await client.getChainId()) !== sepolia.id) {
        throw new Error("RPC khong ket noi dung mang Sepolia.");
    }

    const latestBlock = await client.getBlockNumber();

    if (startBlock > latestBlock) {
        throw new Error("Block trien khai lon hon block hien tai.");
    }

    console.log("Hop dong:", address);
    console.log("San pham:", productId);
    console.log(
        `Doc lich su tu block ${startBlock} den ${latestBlock}...`,
    );

    // Chia nho pham vi de tranh yeu cau RPC qua lon.
    const chunkSize = 500n;
    const history = [];

    for (
        let fromBlock = startBlock;
        fromBlock <= latestBlock;
        fromBlock += chunkSize
    ) {
        const end = fromBlock + chunkSize - 1n;
        const toBlock = end < latestBlock ? end : latestBlock;

        const logs = await client.getLogs({
            address,
            events: eventAbi,
            fromBlock,
            toBlock,
            strict: true,
        });

        for (const log of logs) {
            if (log.args.productId !== productId) continue;

            history.push(log);
        }

        console.log(`Da doc block ${fromBlock} - ${toBlock}`);
    }

    history.sort((a, b) => {
        if (a.blockNumber < b.blockNumber) return -1;
        if (a.blockNumber > b.blockNumber) return 1;
        return a.logIndex - b.logIndex;
    });

    const result = history.map((log) => ({
        event: log.eventName,
        productId: log.args.productId,
        from:
            log.eventName === "ProductRegistered"
                ? null
                : log.args.from,
        to:
            log.eventName === "ProductRegistered"
                ? log.args.manufacturer
                : log.args.to,
        time: new Date(
            Number(log.args.timestamp) * 1000,
        ).toISOString(),
        blockNumber: log.blockNumber.toString(),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        explorerUrl:
            `https://sepolia.etherscan.io/tx/${log.transactionHash}`,
    }));

    console.log("\nLICH SU SAN PHAM:");
    console.log(JSON.stringify(result, null, 2));
    console.log(`\nTong so su kien: ${result.length}`);

    if (result.length === 0) {
        console.log(
            "Chua tim thay su kien. Can kiem tra dia chi hop dong, ABI va ma san pham.",
        );
    }

    return {
        productId,
        contractAddress: address,
        fromBlock: startBlock.toString(),
        toBlock: latestBlock.toString(),
        total: result.length,
        events: result,
    };
}

export async function startEventWatch({ client, address }) {
    const startBlock = (await client.getBlockNumber()) + 1n;

    const stopWatching = [];

    for (const eventName of [
        "ProductRegistered",
        "ProductTransferred",
    ]) {
        const unwatch = client.watchContractEvent({
            address,
            abi: eventAbi,
            eventName,
            fromBlock: startBlock,
            pollingInterval: 4_000,
            strict: true,

            onLogs(logs) {
                for (const log of logs) {
                    const notification = {
                        event: log.eventName,
                        productId: log.args.productId,
                        transactionHash: log.transactionHash,
                        blockNumber: log.blockNumber?.toString(),
                        removed: Boolean(log.removed),
                    };

                    for (const listener of eventSubscribers) {
                        try {
                            listener(notification);
                        } catch (error) {
                            console.error(
                                "Loi gui thong bao:",
                                error.message,
                            );
                        }
                    }
                    const registered =
                        log.eventName === "ProductRegistered";

                    console.log("\n========== SU KIEN BLOCKCHAIN ==========");
                    console.log(
                        "Trang thai:",
                        log.removed ? "BI GO DO TAI TO CHUC CHUOI" : "MOI",
                    );
                    console.log("Su kien:", log.eventName);
                    console.log("San pham:", log.args.productId);

                    if (registered) {
                        console.log(
                            "Nha san xuat:",
                            log.args.manufacturer,
                        );
                    } else {
                        console.log("Ben giao:", log.args.from);
                        console.log("Ben nhan:", log.args.to);
                    }

                    console.log(
                        "Block:",
                        log.blockNumber?.toString(),
                    );
                    console.log("Giao dich:", log.transactionHash);
                    console.log(
                        "Etherscan:",
                        `https://sepolia.etherscan.io/tx/${log.transactionHash}`,
                    );
                    console.log("========================================\n");
                }
            },

            onError(error) {
                console.error(
                    `[Theo doi ${eventName}]`,
                    error.shortMessage || error.message,
                );
            },
        });

        stopWatching.push(unwatch);
    }

    console.log(
        `Da bat theo doi ProductRegistered va ProductTransferred tu block ${startBlock}.`,
    );

    return () => {
        for (const stop of stopWatching) {
            stop();
        }
    };
}
