import { useState } from "react";

export default function ProductMetadata({ token }) {
    const [productId, setProductId] = useState("SP001");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    async function saveMetadata(event) {
        event.preventDefault();
        setBusy(true);
        setMessage("");

        try {
            const response = await fetch(
                "http://localhost:3001/api/products",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        productId,
                        name,
                        description,
                    }),
                },
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Lưu thất bại.");
            }

            setMessage(`Đã lưu thông tin sản phẩm ${result.productId}.`);
        } catch (error) {
            setMessage(error.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="register-product">
            <h3>Thông tin chi tiết sản phẩm</h3>
            <p>Nhập đúng mã sản phẩm bạn đã đăng ký trên Sepolia.</p>

            <form onSubmit={saveMetadata}>
                <label htmlFor="metadata-id">Mã sản phẩm</label>
                <input
                    id="metadata-id"
                    value={productId}
                    onChange={(event) =>
                        setProductId(event.target.value.toUpperCase())
                    }
                    pattern="[A-Z0-9_-]{1,64}"
                    maxLength={64}
                    disabled={busy}
                    required
                />

                <label htmlFor="metadata-name">Tên sản phẩm</label>
                <input
                    id="metadata-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ví dụ: Cà phê rang xay 500 g"
                    maxLength={200}
                    disabled={busy}
                    required
                />

                <label htmlFor="metadata-description">Mô tả</label>
                <textarea
                    id="metadata-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Thông tin bổ sung về sản phẩm"
                    maxLength={5000}
                    rows={4}
                    disabled={busy}
                />

                <button type="submit" disabled={busy}>
                    {busy ? "Đang lưu..." : "Lưu thông tin sản phẩm"}
                </button>
            </form>

            {message && <p role="status">{message}</p>}
        </div>
    );
}