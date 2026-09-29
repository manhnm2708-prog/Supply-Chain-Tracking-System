import { useState } from "react";
import { createWalletClient, custom } from "viem";
import RegisterProduct from "./RegisterProduct";
import ProductMetadata from "./ProductMetadata";
import TransferProduct from "./TransferProduct.jsx";
const API = "http://localhost:3001/api/auth";

async function requestApi(path, options = {}) {
    const response = await fetch(`${API}${path}`, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Yêu cầu thất bại.");
    }

    return data;
}

export default function WalletAuth({ account }) {
    const [session, setSession] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    async function signIn() {
        setBusy(true);
        setMessage("");
        setSession(null);

        try {
            const provider = window.ethereum;

            if (!provider) {
                throw new Error("Không tìm thấy MetaMask.");
            }

            const chainId = await provider.request({
                method: "eth_chainId",
            });

            if (chainId.toLowerCase() !== "0xaa36a7") {
                throw new Error("Hãy chọn mạng Sepolia.");
            }

            const accounts = await provider.request({
                method: "eth_accounts",
            });

            if (accounts[0]?.toLowerCase() !== account.toLowerCase()) {
                throw new Error("Tài khoản đã thay đổi. Hãy kết nối lại.");
            }

            const challenge = await requestApi("/challenge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ address: account }),
            });

            const walletClient = createWalletClient({
                transport: custom(provider),
            });

            const signature = await walletClient.signMessage({
                account,
                message: challenge.message,
            });

            const result = await requestApi("/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nonce: challenge.nonce,
                    signature,
                }),
            });

            setSession(result);
            setMessage("Đăng nhập thành công bằng chữ ký MetaMask.");
        } catch (error) {
            setMessage(error.shortMessage || error.message);
        } finally {
            setBusy(false);
        }
    }

    async function checkSession() {
        if (!session) return;

        setBusy(true);

        try {
            const result = await requestApi("/me", {
                headers: {
                    Authorization: `Bearer ${session.token}`,
                },
            });

            setMessage(`Backend xác nhận ví: ${result.address}`);
        } catch (error) {
            setSession(null);
            setMessage(error.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="card">
            <h2>Xác thực tài khoản</h2>

            <p>
                Ký thông điệp để xác minh ví với backend.
                Thao tác này không tốn phí gas.
            </p>

            {!session ? (
                <button onClick={signIn} disabled={busy}>
                    {busy ? "Đang xử lý..." : "Đăng nhập bằng chữ ký"}
                </button>
            ) : (
                <>
                    <p>
                        Phiên hết hạn lúc:{" "}
                        {new Date(session.expiresAt).toLocaleTimeString("vi-VN")}
                    </p>

                    <button onClick={checkSession} disabled={busy}>
                        {busy ? "Đang kiểm tra..." : "Kiểm tra phiên đăng nhập"}
                    </button>
                </>
            )}

            {message && <p role="status">{message}</p>}
            {session && (
                <>
                    <RegisterProduct account={session.address} />
                    <ProductMetadata token={session.token} />
                    <TransferProduct account={session.address} />
                </>
            )}
        </section>
    );
}