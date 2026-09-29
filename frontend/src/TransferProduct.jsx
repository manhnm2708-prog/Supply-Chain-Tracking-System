import { useState } from "react";
import {
    createPublicClient,
    createWalletClient,
    custom,
    getAddress,
    http,
    isAddress,
    parseAbi,
    zeroAddress,
} from "viem";
import { sepolia } from "viem/chains";

const CONTRACT_ADDRESS =
    "0xDdDbE643e31c6662F12E2F03caBD95819a12FE5A";

const ABI = parseAbi([
    "function transferProduct(string productId, address to)",
    "function getProduct(string productId) view returns ((string productId, address manufacturer, address currentCustodian, uint256 createdAt, bool exists))",
]);

const publicClient = createPublicClient({
    chain: sepolia,
    transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

export default function TransferProduct({ account }) {
    const [productId, setProductId] = useState("SP001");
    const [recipient, setRecipient] = useState(
        "0xef528E14d4891A062120353f7E32764aC31D9d1c",
    );

    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [txHash, setTxHash] = useState("");
    const [snapshot, setSnapshot] = useState(null);

    async function readCustodian() {
        setBusy(true);
        setMessage("");
        setSnapshot(null);

        try {
            const blockNumber = await publicClient.getBlockNumber();

            const product = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: ABI,
                functionName: "getProduct",
                args: [productId],
                blockNumber,
            });

            setSnapshot({
                productId,
                custodian: product.currentCustodian,
                blockNumber: blockNumber.toString(),
            });
        } catch (error) {
            setMessage(error.shortMessage || error.message);
        } finally {
            setBusy(false);
        }
    }

    async function transferProduct(event) {
        event.preventDefault();
        setMessage("");

        if (!/^[A-Z0-9_-]{1,64}$/.test(productId)) {
            setMessage("Mã sản phẩm không hợp lệ.");
            return;
        }

        const rawRecipient = recipient.trim();

        if (!isAddress(rawRecipient)) {
            setMessage("Địa chỉ ví nhận không hợp lệ.");
            return;
        }

        const to = getAddress(rawRecipient);

        if (
            to === zeroAddress ||
            to.toLowerCase() === account.toLowerCase()
        ) {
            setMessage("Không chuyển cho địa chỉ rỗng hoặc chính mình.");
            return;
        }

        setBusy(true);
        setSnapshot(null);

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

            setMessage("Đang kiểm tra điều kiện chuyển giao...");

            const { request } = await publicClient.simulateContract({
                address: CONTRACT_ADDRESS,
                abi: ABI,
                functionName: "transferProduct",
                args: [productId, to],
                account,
            });

            setMessage("Hãy kiểm tra bên nhận và xác nhận trong MetaMask.");

            submittedHash = await walletClient.writeContract(request);
            setTxHash(submittedHash);

            setMessage("Đã gửi giao dịch. Đang chờ xác nhận...");

            const receipt = await publicClient.waitForTransactionReceipt({
                hash: submittedHash,
                confirmations: 2,
            });

            if (receipt.status !== "success") {
                setTxHash("");
                setMessage("Giao dịch thất bại trên blockchain.");
                return;
            }

            setMessage(
                `Chuyển giao ${productId} thành công tại block ` +
                `${receipt.blockNumber.toString()}. ` +
                "Bấm Kiểm tra bên nắm giữ để đọc lại dữ liệu.",
            );
        } catch (error) {
            const reason = error.shortMessage || error.message;

            setMessage(
                submittedHash
                    ? `Chưa xác nhận được kết quả: ${reason}. ` +
                    "Hãy kiểm tra giao dịch qua liên kết bên dưới."
                    : reason,
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="register-product">
            <h3>Chuyển giao sản phẩm</h3>

            <p>
                Nhà sản xuất chuyển cho nhà phân phối.
                Nhà phân phối chuyển cho người bán.
            </p>

            <form onSubmit={transferProduct}>
                <label htmlFor="transfer-product-id">Mã sản phẩm</label>
                <input
                    id="transfer-product-id"
                    value={productId}
                    onChange={(event) => {
                        setProductId(event.target.value.toUpperCase());
                        setSnapshot(null);
                    }}
                    maxLength={64}
                    disabled={busy || Boolean(txHash)}
                    required
                />

                <label htmlFor="transfer-recipient">Địa chỉ ví nhận</label>
                <input
                    id="transfer-recipient"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    placeholder="0x..."
                    disabled={busy || Boolean(txHash)}
                    required
                />

                <button
                    type="submit"
                    disabled={busy || Boolean(txHash)}
                >
                    {busy ? "Đang xử lý..." : "Chuyển giao trên Sepolia"}
                </button>

                <button
                    type="button"
                    onClick={readCustodian}
                    disabled={busy || !productId}
                >
                    Kiểm tra bên nắm giữ
                </button>
            </form>

            {message && <p role="status">{message}</p>}

            {txHash && (
                <a
                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    Xem giao dịch chuyển giao ↗
                </a>
            )}

            {snapshot && (
                <div>
                    <p>
                        Bên nắm giữ {snapshot.productId}
                        {" "}tại block {snapshot.blockNumber}:
                    </p>
                    <code>{snapshot.custodian}</code>
                </div>
            )}
        </div>
    );
}