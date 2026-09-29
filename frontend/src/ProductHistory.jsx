import { useEffect, useState } from "react";

const API = "http://localhost:3001";

const participants = {
    "0x430c3a72f51d7e6ba7cc139ac171af96aca11891": "Manufacturer",
    "0xef528e14d4891a062120353f7e32764ac31d9d1c": "Distributor",
    "0x5c0faee26a22bc26080a870ea82a5570a05da45c": "Seller",
};

function displayAddress(address) {
    if (!address) return "—";

    const name = participants[address.toLowerCase()];
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

    return name ? `${name} (${shortAddress})` : shortAddress;
}

export default function ProductHistory() {
    const [productId, setProductId] = useState("SP001");
    const [history, setHistory] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [liveStatus, setLiveStatus] = useState("");

    // Theo doi san pham da tra cuu, khong phai o nhap dang sua.
    const watchedProductId = history?.productId || "";

    useEffect(() => {
        if (!watchedProductId) return;

        let closed = false;
        let loading = false;
        let refreshAgain = false;
        let retryTimer;

        const controller = new AbortController();
        const stream = new EventSource(`${API}/api/events/stream`);

        async function refreshHistory() {
            if (closed) return;

            if (loading) {
                refreshAgain = true;
                return;
            }

            loading = true;

            try {
                do {
                    refreshAgain = false;

                    const response = await fetch(
                        `${API}/api/products/${encodeURIComponent(
                            watchedProductId,
                        )}/history`,
                        { signal: controller.signal },
                    );

                    if (!response.ok) {
                        throw new Error("Không tải được lịch sử mới.");
                    }

                    const data = await response.json();

                    if (!Array.isArray(data.events)) {
                        throw new Error("Dữ liệu lịch sử không hợp lệ.");
                    }

                    if (closed) return;

                    setHistory((previous) =>
                        previous?.productId === watchedProductId
                            ? data
                            : previous,
                    );

                    setLiveStatus(
                        `Đã cập nhật lúc ${new Date().toLocaleTimeString(
                            "vi-VN",
                        )}`,
                    );
                } while (refreshAgain && !closed);
            } catch (error) {
                if (!closed && error.name !== "AbortError") {
                    setLiveStatus(
                        "Chưa tải được lịch sử mới. Đang thử lại...",
                    );

                    clearTimeout(retryTimer);
                    retryTimer = setTimeout(refreshHistory, 5_000);
                }
            } finally {
                loading = false;
            }
        }

        stream.onopen = () => {
            if (closed) return;

            setLiveStatus("Đã kết nối cập nhật trực tiếp.");

            // Doc lai khi ket noi/reconnect de bu du lieu bi lo.
            void refreshHistory();
        };

        stream.onmessage = (event) => {
            try {
                const notification = JSON.parse(event.data);

                if (notification.productId === watchedProductId) {
                    setLiveStatus(
                        "Có thay đổi trên blockchain. Đang cập nhật...",
                    );
                    void refreshHistory();
                }
            } catch {
                setLiveStatus("Không đọc được thông báo sự kiện.");
            }
        };

        stream.onerror = () => {
            if (!closed) {
                setLiveStatus(
                    "Mất kết nối thông báo. Đang kết nối lại...",
                );
            }
        };

        return () => {
            closed = true;
            clearTimeout(retryTimer);
            controller.abort();
            stream.close();
        };
    }, [watchedProductId]);

    async function loadHistory(event) {
        event.preventDefault();

        const id = productId.trim();

        if (!/^[A-Z0-9_-]{1,64}$/.test(id)) {
            setHistory(null);
            setMessage(
                "Mã sản phẩm gồm 1–64 ký tự: chữ in hoa, số, dấu _ hoặc -.",
            );
            return;
        }

        setBusy(true);
        setMessage("");
        setHistory(null);

        try {
            const response = await fetch(
                `${API}/api/products/${encodeURIComponent(id)}/history`,
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Không đọc được lịch sử.");
            }

            if (!Array.isArray(data.events)) {
                throw new Error("Dữ liệu lịch sử trả về không hợp lệ.");
            }

            setHistory(data);

            if (data.events.length === 0) {
                setMessage("Chưa tìm thấy sự kiện của sản phẩm này.");
            }
        } catch (error) {
            setMessage(error.message || "Không kết nối được backend.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="card">
            <h2>Lịch sử truy xuất sản phẩm</h2>

            <p>
                Tra cứu các lần đăng ký và chuyển giao trên Sepolia.
                Không cần ký giao dịch, không tốn gas.
            </p>

            <form onSubmit={loadHistory}>
                <label htmlFor="history-product-id">Mã sản phẩm</label>

                <input
                    id="history-product-id"
                    value={productId}
                    onChange={(event) =>
                        setProductId(event.target.value.toUpperCase())
                    }
                    placeholder="SP001"
                    maxLength={64}
                    disabled={busy}
                    required
                    style={{
                        display: "block",
                        boxSizing: "border-box",
                        width: "100%",
                        padding: "12px",
                        margin: "12px 0",
                    }}
                />

                <button type="submit" disabled={busy}>
                    {busy ? "Đang đọc blockchain..." : "Tra cứu lịch sử"}
                </button>
            </form>

            {message && <p role="status">{message}</p>}
            {history && liveStatus && (
                <p role="status">
                    <strong>Cập nhật trực tiếp:</strong> {liveStatus}
                </p>
            )}

            {history && history.events.length > 0 && (
                <>
                    <p>
                        Sản phẩm <strong>{history.productId}</strong>:{" "}
                        {history.events.length} sự kiện.
                        {" "}Đã tra cứu đến block {history.toBlock}.
                    </p>

                    <div style={{ overflowX: "auto" }}>
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                textAlign: "left",
                            }}
                        >
                            <thead>
                                <tr>
                                    {[
                                        "Hoạt động",
                                        "Bên giao",
                                        "Bên nhận",
                                        "Thời gian",
                                        "Block",
                                        "Giao dịch",
                                    ].map((heading) => (
                                        <th
                                            key={heading}
                                            style={{
                                                padding: "12px",
                                                borderBottom: "1px solid #777",
                                            }}
                                        >
                                            {heading}
                                        </th>
                                    ))}
                                </tr>
                            </thead>

                            <tbody>
                                {history.events.map((item) => (
                                    <tr
                                        key={`${item.transactionHash}-${item.logIndex}`}
                                    >
                                        <td style={{ padding: "12px" }}>
                                            {item.event === "ProductRegistered"
                                                ? "Đăng ký sản phẩm"
                                                : "Chuyển giao"}
                                        </td>

                                        <td
                                            title={item.from || ""}
                                            style={{ padding: "12px" }}
                                        >
                                            {displayAddress(item.from)}
                                        </td>

                                        <td
                                            title={item.to || ""}
                                            style={{ padding: "12px" }}
                                        >
                                            {displayAddress(item.to)}
                                        </td>

                                        <td style={{ padding: "12px" }}>
                                            {new Date(item.time).toLocaleString(
                                                "vi-VN",
                                                { timeZone: "Asia/Ho_Chi_Minh" },
                                            )}
                                            {" "}(VN)
                                        </td>

                                        <td style={{ padding: "12px" }}>
                                            {item.blockNumber}
                                        </td>

                                        <td style={{ padding: "12px" }}>
                                            <a
                                                href={`https://sepolia.etherscan.io/tx/${item.transactionHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                Xem giao dịch ↗
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}