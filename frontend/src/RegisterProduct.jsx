import { useState } from "react";
import {
    createPublicClient,
    createWalletClient,
    custom,
    http,
    parseAbi,
} from "viem";
import { sepolia } from "viem/chains";

const CONTRACT_ADDRESS =
    "0xDdDbE643e31c6662F12E2F03caBD95819a12FE5A";

const ABI = parseAbi([
    "function registerProduct(string productId)",
]);

const publicClient = createPublicClient({
    chain: sepolia,
    transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

export default function RegisterProduct({ account }) {
    const [productId, setProductId] = useState("SP001");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [txHash, setTxHash] = useState("");
    const [registered, setRegistered] = useState(false);

    async function registerProduct(event) {
        event.preventDefault();

        // Quy uoc ma san pham cua giao dien.
        if (!/^[A-Z0-9_-]{1,64}$/.test(productId)) {
            setMessage(
                "Mã cần có 1–64 ký tự: chữ in hoa, số, dấu gạch ngang hoặc gạch dưới.",
            );
            return;
        }

        setBusy(true);
        setMessage("");

        let submittedHash = "";

        try {
            const provider = window.ethereum;

            if (!provider) {
                throw new Error("Không tìm thấy MetaMask.");
            }

            const chainId = await provider.request({
                method: "eth_chainId",
            });

            if (chainId.toLowerCase() !== "0xaa36a7") {
                throw new Error("Hãy chọn mạng Ethereum Sepolia.");
            }

            const accounts = await provider.request({
                method: "eth_accounts",
            });

            if (accounts[0]?.toLowerCase() !== account.toLowerCase()) {
                throw new Error("Ví đã thay đổi. Hãy kết nối và đăng nhập lại.");
            }

            const walletClient = createWalletClient({
                account,
                chain: sepolia,
                transport: custom(provider),
            });

            setMessage("Đang kiểm tra điều kiện đăng ký...");

            // Mo phong de kiem tra quyen va ma trung truoc khi gui.
            const { request } = await publicClient.simulateContract({
                address: CONTRACT_ADDRESS,
                abi: ABI,
                functionName: "registerProduct",
                args: [productId],
                account,
            });

            setMessage("Hãy xác nhận giao dịch trong MetaMask.");

            submittedHash = await walletClient.writeContract(request);
            setTxHash(submittedHash);

            setMessage("Đã gửi giao dịch. Đang chờ blockchain xác nhận...");

            const receipt = await publicClient.waitForTransactionReceipt({
                hash: submittedHash,
                confirmations: 2,
            });

            if (receipt.status !== "success") {
                setTxHash("");
                throw new Error("Giao dịch bị từ chối trên blockchain.");
            }

            setRegistered(true);
            setMessage(
                `Đã đăng ký ${productId} trên Sepolia. ` +
                `Block: ${receipt.blockNumber.toString()}.`,
            );
        } catch (error) {
            const reason = error.shortMessage || error.message;

            setMessage(
                submittedHash
                    ? `Chưa hoàn tất xác nhận: ${reason}. ` +
                    "Hãy kiểm tra liên kết giao dịch trước khi thử lại."
                    : reason,
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="register-product">
            <h3>Đăng ký sản phẩm trên blockchain</h3>

            <form onSubmit={registerProduct}>
                <label htmlFor="product-id">Mã sản phẩm</label>

                <input
                    id="product-id"
                    value={productId}
                    onChange={(event) => {
                        setProductId(event.target.value.toUpperCase());
                    }}
                    maxLength={64}
                    placeholder="Ví dụ: SP001"
                    disabled={busy || Boolean(txHash)}
                    required
                />

                <button
                    type="submit"
                    disabled={busy || Boolean(txHash)}
                >
                    {registered
                        ? "Đã đăng ký"
                        : busy
                            ? "Đang xử lý..."
                            : "Đăng ký lên Sepolia"}
                </button>
            </form>

            {message && <p role="status">{message}</p>}

            {txHash && (
                <a
                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    Xem giao dịch đăng ký ↗
                </a>
            )}

            {registered && (
                <p>
                    Mã sản phẩm đã được ghi trên blockchain.
                    Thông tin tên và mô tả chưa được lưu vào database ở bước này.
                </p>
            )}
        </div>
    );
}