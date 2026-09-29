import { Router } from "express";
import { randomBytes } from "node:crypto";
import { getAddress, isAddress, verifyMessage } from "viem";

export const authRouter = Router();

const challenges = new Map();
const sessions = new Map();

const CHALLENGE_TTL = 5 * 60 * 1000; // 5 phut
const SESSION_TTL = 60 * 60 * 1000; // 1 gio

function removeExpired() {
    const now = Date.now();

    for (const [key, value] of challenges) {
        if (value.expiresAt <= now) challenges.delete(key);
    }

    for (const [key, value] of sessions) {
        if (value.expiresAt <= now) sessions.delete(key);
    }
}

// Tao thong diep dung mot lan.
authRouter.post("/challenge", (req, res) => {
    removeExpired();

    const address = req.body?.address;

    if (typeof address !== "string" || !isAddress(address)) {
        return res.status(400).json({
            message: "Dia chi vi khong hop le.",
        });
    }

    if (challenges.size >= 1000) {
        return res.status(429).json({
            message: "He thong dang ban. Hay thu lai sau.",
        });
    }

    const walletAddress = getAddress(address);
    const nonce = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + CHALLENGE_TTL;
    const origin =
        process.env.FRONTEND_ORIGIN || "http://localhost:5173";

    const message = [
        "Supply Chain Tracking - Dang nhap",
        `Website: ${origin}`,
        `Wallet: ${walletAddress}`,
        "Chain ID: 11155111",
        `Contract: ${process.env.CONTRACT_ADDRESS}`,
        `Nonce: ${nonce}`,
        `Expires: ${new Date(expiresAt).toISOString()}`,
        "",
        "Chi ky de dang nhap. Khong chuyen tien hay cap quyen tai san.",
    ].join("\n");

    challenges.set(nonce, {
        address: walletAddress,
        message,
        expiresAt,
    });

    res.set("Cache-Control", "no-store");
    res.json({ nonce, message, expiresAt });
});

// Xac minh chu ky va tao phien dang nhap.
authRouter.post("/verify", async (req, res) => {
    removeExpired();

    const { nonce, signature } = req.body || {};

    if (
        typeof nonce !== "string" ||
        typeof signature !== "string" ||
        !/^0x[0-9a-fA-F]{130}$/.test(signature)
    ) {
        return res.status(400).json({
            message: "Du lieu chu ky khong hop le.",
        });
    }

    const challenge = challenges.get(nonce);

    if (!challenge) {
        return res.status(401).json({
            message: "Thong diep da het han hoac da duoc su dung.",
        });
    }

    // Tieu thu nonce truoc khi xu ly bat dong bo de tranh dung lai.
    challenges.delete(nonce);

    try {
        const valid = await verifyMessage({
            address: challenge.address,
            message: challenge.message,
            signature,
        });

        if (!valid || challenge.expiresAt <= Date.now()) {
            return res.status(401).json({
                message: "Chu ky khong dung hoac thong diep da het han.",
            });
        }

        if (sessions.size >= 1000) {
            return res.status(429).json({
                message: "He thong dang ban. Hay thu lai sau.",
            });
        }

        const token = randomBytes(32).toString("hex");
        const expiresAt = Date.now() + SESSION_TTL;

        sessions.set(token, {
            address: challenge.address,
            expiresAt,
        });

        res.set("Cache-Control", "no-store");
        res.json({
            token,
            address: challenge.address,
            expiresAt,
        });
    } catch {
        res.status(401).json({
            message: "Khong xac minh duoc chu ky.",
        });
    }
});

// Middleware se dung cho API ghi san pham o buoc tiep theo.
export function requireAuth(req, res, next) {
    removeExpired();

    const authorization = req.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

    const session = sessions.get(token);

    if (!session) {
        return res.status(401).json({
            message: "Ban chua dang nhap hoac phien da het han.",
        });
    }

    req.auth = session;
    next();
}

authRouter.get("/me", requireAuth, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
        address: req.auth.address,
        expiresAt: req.auth.expiresAt,
    });
});