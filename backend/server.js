import "dotenv/config";
import {
    listProductMetadata,
    countProductMetadata,
    saveProductMetadata,
} from "./db.js";
import express from "express";
import cors from "cors";
import {
    createPublicClient,
    getAddress,
    http,
    parseAbi,
} from "viem";
import { sepolia } from "viem/chains";
import { authRouter, requireAuth } from "./auth.js";
import {
    getProductHistory,
    startEventWatch,
    subscribeToProductEvents,
} from "./events.js";

const app = express();

const PORT = Number(process.env.PORT || 3001);
const RPC_URL = process.env.SEPOLIA_RPC_URL;

if (!RPC_URL || !process.env.CONTRACT_ADDRESS) {
    throw new Error("Thieu RPC URL hoac dia chi hop dong trong .env");
}

const CONTRACT_ADDRESS = getAddress(process.env.CONTRACT_ADDRESS);

// Chi can khai bao cac ham ma backend se doc o buoc nay.
const abi = parseAbi([
    "function admin() view returns (address)",
    "function participants(address) view returns (uint8 role, bool active)",
    "function getProduct(string productId) view returns ((string productId, address manufacturer, address currentCustodian, uint256 createdAt, bool exists))",
]);

const client = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL, {
        timeout: 15_000,
        retryCount: 1,
    }),
});

// Danh sach dia chi de tra cuu.
// Vai tro va trang thai duoc doc truc tiep tu blockchain.
const participantDirectory = [
    {
        name: "Manufacturer",
        address: "0x430c3A72F51d7e6BA7Cc139aC171af96aca11891",
    },
    {
        name: "Distributor",
        address: "0xef528E14d4891A062120353f7E32764aC31D9d1c",
    },
    {
        name: "Seller",
        address: "0x5C0fAeE26a22Bc26080a870Ea82A5570A05DA45c",
    },
];

const roleNames = [
    "None",
    "Manufacturer",
    "Distributor",
    "Seller",
];

app.use(
    cors({
        origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    }),
);

app.use(express.json({ limit: "100kb" }));
app.use("/api/auth", authRouter);

app.get("/", (_req, res) => {
    res.json({
        message: "Supply Chain Tracking API",
        endpoints: [
            "/api/health",
            "/api/contract",
            "/api/participants",
        ],
    });
});

// Kiem tra backend va ket noi blockchain.
app.get("/api/health", async (_req, res, next) => {
    try {
        const chainId = await client.getChainId();

        if (chainId !== sepolia.id) {
            return res.status(503).json({
                status: "error",
                message: "RPC khong ket noi dung Ethereum Sepolia.",
            });
        }

        const blockNumber = await client.getBlockNumber();

        res.json({
            status: "ok",
            network: "sepolia",
            chainId,
            blockNumber: blockNumber.toString(),
        });
    } catch (error) {
        next(error);
    }
});

// Doc dia chi Admin tu hop dong.
app.get("/api/contract", async (_req, res, next) => {
    try {
        const admin = await client.readContract({
            address: CONTRACT_ADDRESS,
            abi,
            functionName: "admin",
        });

        res.json({
            contractAddress: CONTRACT_ADDRESS,
            admin,
            explorerUrl:
                `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`,
        });
    } catch (error) {
        next(error);
    }
});

// Doc vai tro va trang thai cua ba don vi.
app.get("/api/participants", async (_req, res, next) => {
    try {
        // Doc cung mot block de cac ket qua nhat quan.
        const blockNumber = await client.getBlockNumber();
        const results = [];

        for (const participant of participantDirectory) {
            const address = getAddress(participant.address);

            const [role, active] = await client.readContract({
                address: CONTRACT_ADDRESS,
                abi,
                functionName: "participants",
                args: [address],
                blockNumber,
            });

            results.push({
                name: participant.name,
                address,
                role: Number(role),
                roleName: roleNames[Number(role)] ?? "Unknown",
                active,
            });
        }

        res.json({
            blockNumber: blockNumber.toString(),
            participants: results,
        });
    } catch (error) {
        next(error);
    }
});
// Doc thong tin san pham da luu trong SQLite.
app.get("/api/products", (_req, res) => {
    try {
        const products = listProductMetadata(
            sepolia.id,
            CONTRACT_ADDRESS,
        );

        const total = countProductMetadata(
            sepolia.id,
            CONTRACT_ADDRESS,
        );

        res.json({
            source: "database",
            total,
            limit: 100,
            products,
        });
    } catch (error) {
        console.error("Loi doc SQLite:", error.name);

        res.status(500).json({
            message: "Khong doc duoc thong tin san pham trong database.",
        });
    }
});

app.post("/api/products", requireAuth, async (req, res) => {
    const { productId, name, description = "" } = req.body || {};

    if (
        typeof productId !== "string" ||
        !/^[A-Z0-9_-]{1,64}$/.test(productId)
    ) {
        return res.status(400).json({
            message: "Ma san pham khong hop le.",
        });
    }

    if (
        typeof name !== "string" ||
        name.trim().length < 1 ||
        name.trim().length > 200 ||
        typeof description !== "string" ||
        description.length > 5000
    ) {
        return res.status(400).json({
            message: "Ten can 1-200 ky tu; mo ta toi da 5000 ky tu.",
        });
    }

    // Lay dia chi tu phien da xac thuc, khong tin dia chi trong body.
    const walletAddress = req.auth.address;

    let product;

    try {
        const blockNumber = await client.getBlockNumber();

        const [role, active] = await client.readContract({
            address: CONTRACT_ADDRESS,
            abi,
            functionName: "participants",
            args: [walletAddress],
            blockNumber,
        });

        if (Number(role) !== 1 || !active) {
            return res.status(403).json({
                message: "Chi nha san xuat dang hoat dong duoc luu thong tin.",
            });
        }

        product = await client.readContract({
            address: CONTRACT_ADDRESS,
            abi,
            functionName: "getProduct",
            args: [productId],
            blockNumber,
        });
    } catch (error) {
        const revertError =
            typeof error.walk === "function"
                ? error.walk(
                    (item) => item.name === "ContractFunctionRevertedError",
                )
                : null;

        if (revertError?.reason === "Product does not exist") {
            return res.status(404).json({
                message: "San pham chua ton tai. Hay dang ky tren Sepolia truoc.",
            });
        }

        return res.status(502).json({
            message: "Chua xac minh duoc san pham tren blockchain. Hay thu lai.",
        });
    }

    if (
        !product.exists ||
        product.manufacturer.toLowerCase() !== walletAddress.toLowerCase()
    ) {
        return res.status(403).json({
            message: "Vi dang nhap khong phai nha san xuat cua san pham.",
        });
    }

    // Kiem tra lai han phien sau khi cho RPC.
    if (req.auth.expiresAt <= Date.now()) {
        return res.status(401).json({
            message: "Phien da het han. Hay dang nhap lai.",
        });
    }

    try {
        saveProductMetadata({
            chainId: sepolia.id,
            contractAddress: CONTRACT_ADDRESS,
            productId,
            name: name.trim(),
            description: description.trim(),
            manufacturerAddress: product.manufacturer,
        });

        res.json({
            message: "Da luu thong tin san pham.",
            productId,
        });
    } catch {
        res.status(500).json({
            message: "Khong luu duoc du lieu vao SQLite.",
        });
    }
});

// Tra cuu lich su dang ky va chuyen giao san pham.
app.get("/api/products/:productId/history", async (req, res) => {
    const { productId } = req.params;

    if (!/^[A-Z0-9_-]{1,64}$/.test(productId)) {
        return res.status(400).json({
            message: "Ma san pham khong hop le.",
        });
    }

    try {
        const history = await getProductHistory(productId);

        res.setHeader("Cache-Control", "no-store");

        return res.json({
            source: "blockchain",
            network: "sepolia",
            ...history,
        });
    } catch (error) {
        console.error(
            "Loi doc lich su:",
            error.shortMessage || error.message,
        );

        return res.status(502).json({
            message:
                "Khong doc duoc lich su tu blockchain. Hay thu lai.",
        });
    }
});

// Ket noi SSE: gui thong bao su kien moi den frontend.
app.get("/api/events/stream", (_req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const unsubscribe = subscribeToProductEvents((notification) => {
        if (res.destroyed || res.writableEnded) return;

        const accepted = res.write(
            `data: ${JSON.stringify(notification)}\n\n`,
        );

        // Dong ket noi cham; trinh duyet se tu ket noi lai.
        if (!accepted) res.end();
    });

    // Giu ket noi khi chua co giao dich moi.
    const heartbeat = setInterval(() => {
        if (!res.destroyed && !res.writableEnded) {
            res.write(": heartbeat\n\n");
        }
    }, 15_000);

    res.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
    });

    res.write(": connected\n\n");
});

// Tra loi khi duong dan khong ton tai.
app.use((_req, res) => {
    res.status(404).json({
        message: "API khong ton tai.",
    });
});

// Xu ly loi doc blockchain.
app.use((error, _req, res, _next) => {
    console.error("Loi doc blockchain:", error.name);

    res.status(502).json({
        message:
            "Khong doc duoc du lieu blockchain. Hay kiem tra RPC va ket noi mang.",
    });
});

async function start() {
    const chainId = await client.getChainId();

    if (chainId !== sepolia.id) {
        throw new Error("RPC phai ket noi Ethereum Sepolia.");
    }

    const code = await client.getCode({
        address: CONTRACT_ADDRESS,
    });

    if (!code || code === "0x") {
        throw new Error("Khong tim thay hop dong tai CONTRACT_ADDRESS.");
    }

    await startEventWatch({
        client,
        address: CONTRACT_ADDRESS,
    });

    app.listen(PORT, "127.0.0.1", () => {
        console.log(`Backend dang chay: http://localhost:${PORT}`);
        console.log("Network: Ethereum Sepolia");
        console.log("Contract:", CONTRACT_ADDRESS);
    });
}

start().catch((error) => {
    console.error(
        "Khong khoi dong duoc backend. Kiem tra .env, RPC va mang.",
    );
    console.error("Loai loi:", error.name);
    process.exitCode = 1;
});