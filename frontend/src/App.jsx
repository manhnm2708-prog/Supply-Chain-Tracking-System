import { useEffect, useState } from "react";
import { createPublicClient, custom, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import "./App.css";
import WalletAuth from "./WalletAuth";
import ProductHistory from "./ProductHistory.jsx";

const CONTRACT_ADDRESS = "0xDdDbE643e31c6662F12E2F03caBD95819a12FE5A";

const ABI = parseAbi([
  "function admin() view returns (address)",
  "function participants(address) view returns (uint8 role, bool active)",
]);

const ROLE_NAMES = [
  "Chưa được cấp quyền",
  "Nhà sản xuất",
  "Nhà phân phối",
  "Người bán",
];

const NAV_ITEMS = [
  { id: "overview", icon: "◫", label: "Tổng quan" },
  { id: "lookup", icon: "⌕", label: "Tra cứu & Blockchain" },
  { id: "operations", icon: "⇄", label: "Vận hành lô hàng" },
];

function shortenAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

function StatusDot({ tone = "blue" }) {
  return <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />;
}

export default function App() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState("Đang kiểm tra kết nối...");
  const [productTotal, setProductTotal] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [theme, setTheme] = useState(() => localStorage.getItem("sct-theme") || "dark");

  const provider = window.ethereum;
  const isSepolia = chainId.toLowerCase() === "0xaa36a7";
  const databaseOnline = productTotal !== null;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("sct-theme", theme);
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();

    async function checkBackend() {
      try {
        const response = await fetch("http://localhost:3001/api/products", {
          signal: controller.signal,
        });

        if (!response.ok) throw new Error("Backend trả về lỗi.");

        const data = await response.json();
        setProductTotal(Number(data.total) || 0);
        setDatabaseStatus(`Đã đồng bộ ${data.total} bản ghi sản phẩm`);
      } catch (err) {
        if (err.name !== "AbortError") {
          setProductTotal(null);
          setDatabaseStatus("Backend chưa phản hồi tại cổng 3001");
        }
      }
    }

    checkBackend();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!provider) return undefined;

    function handleAccountsChanged(accounts) {
      setAccount(accounts[0] || "");
      setRole("");
      setError("");
    }

    function handleChainChanged(id) {
      setChainId(id);
      setRole("");
      setError("");
    }

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener("accountsChanged", handleAccountsChanged);
      provider.removeListener("chainChanged", handleChainChanged);
    };
  }, [provider]);

  useEffect(() => {
    if (!provider || !account || !isSepolia) return undefined;

    let cancelled = false;

    async function readRole() {
      try {
        const client = createPublicClient({ chain: sepolia, transport: custom(provider) });
        const admin = await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: "admin",
        });

        let result;
        if (admin.toLowerCase() === account.toLowerCase()) {
          result = "Quản trị viên — Admin";
        } else {
          const [roleId, active] = await client.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: "participants",
            args: [account],
          });
          const name = ROLE_NAMES[Number(roleId)] || "Không xác định";
          result = active
            ? `${name} — Đang hoạt động`
            : `${name} — Chưa kích hoạt hoặc đã thu hồi quyền`;
        }

        if (!cancelled) setRole(result);
      } catch {
        if (!cancelled) {
          setRole("");
          setError("Không đọc được quyền từ hợp đồng. Hãy thử kết nối lại.");
        }
      }
    }

    readRole();
    return () => { cancelled = true; };
  }, [provider, account, isSepolia]);

  async function connectWallet() {
    if (!provider) {
      setError("Hãy mở trang trong trình duyệt đã cài MetaMask.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const currentChain = await provider.request({ method: "eth_chainId" });
      setAccount(accounts[0] || "");
      setChainId(currentChain);
    } catch (err) {
      setError(
        err.code === 4001
          ? "Bạn đã từ chối kết nối ví."
          : "Không kết nối được ví. Hãy kiểm tra cửa sổ MetaMask.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function switchToSepolia() {
    if (!provider) return;
    setBusy(true);
    setError("");
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
      setChainId(await provider.request({ method: "eth_chainId" }));
    } catch {
      setError("Chưa chuyển được mạng. Hãy chọn Sepolia trong MetaMask rồi thử lại.");
    } finally {
      setBusy(false);
    }
  }

  function goToLookup() {
    setActiveTab("lookup");
    requestAnimationFrame(() => document.querySelector("#history-product-id")?.focus());
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <button className="brand" type="button" onClick={() => setActiveTab("overview")}>
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
            <span className="brand-copy">
              <strong>SUPPLY CHAIN <em>TRACKER</em></strong>
              <small>Hệ thống truy xuất chuỗi cung ứng</small>
            </span>
          </button>

          <div className="header-actions">
            <button className="quick-search" type="button" onClick={goToLookup}>
              <span aria-hidden="true">⌕</span><span>Tra cứu mã sản phẩm</span><kbd>SP001</kbd>
            </button>

            {account ? (
              <div className="wallet-badge">
                <StatusDot tone={isSepolia ? "green" : "amber"} />
                <span className="network-name">{isSepolia ? "Sepolia" : "Sai mạng"}</span>
                <code>{shortenAddress(account)}</code>
              </div>
            ) : (
              <button className="metamask-button" type="button" onClick={connectWallet} disabled={busy}>
                <span className="fox-mark" aria-hidden="true">◆</span>
                {busy ? "Đang kết nối..." : "Kết nối MetaMask"}
              </button>
            )}

            <button
              className="icon-button"
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Bật giao diện sáng" : "Bật giao diện tối"}
              title={theme === "dark" ? "Bật giao diện sáng" : "Bật giao diện tối"}
            >
              {theme === "dark" ? "☾" : "☀"}
            </button>
          </div>
        </div>

        <nav className="main-nav" aria-label="Điều hướng chính">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} type="button" className={activeTab === item.id ? "active" : ""} onClick={() => setActiveTab(item.id)}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="workspace">
        {activeTab === "overview" && (
          <div className="tab-panel">
            <section className="hero-panel">
              <div>
                <span className="eyebrow"><StatusDot tone="blue" /> ETHEREUM SEPOLIA</span>
                <h1>Theo dõi hành trình sản phẩm<br />minh bạch trên blockchain.</h1>
                <p>Đăng ký lô hàng, chuyển giao quyền sở hữu và xác minh mọi sự kiện từ một bảng điều khiển duy nhất.</p>
                <div className="hero-actions">
                  <button className="primary-button" type="button" onClick={goToLookup}>Tra cứu sản phẩm <span>→</span></button>
                  <button className="secondary-button" type="button" onClick={() => setActiveTab("operations")}>Mở trung tâm vận hành</button>
                </div>
              </div>
              <div className="chain-visual" aria-hidden="true">
                <div className="chain-orbit chain-orbit--one" /><div className="chain-orbit chain-orbit--two" />
                <div className="chain-cube"><span>Ξ</span></div>
                <span className="chain-node chain-node--one">✓</span><span className="chain-node chain-node--two">#</span><span className="chain-node chain-node--three">⇄</span>
              </div>
            </section>

            <section className="stats-grid" aria-label="Trạng thái hệ thống">
              <article className="stat-card"><span className="stat-icon stat-icon--blue">▦</span><div><small>Tổng bản ghi</small><strong>{databaseOnline ? productTotal : "—"}</strong><p>Dữ liệu sản phẩm trong hệ thống</p></div></article>
              <article className="stat-card"><span className="stat-icon stat-icon--green">●</span><div><small>Backend & database</small><strong>{databaseOnline ? "Trực tuyến" : "Ngoại tuyến"}</strong><p>{databaseStatus}</p></div></article>
              <article className="stat-card"><span className="stat-icon stat-icon--violet">Ξ</span><div><small>Mạng blockchain</small><strong>{isSepolia ? "Sepolia" : "Chờ kết nối"}</strong><p>{isSepolia ? "Đã xác nhận đúng mạng" : "Ethereum testnet"}</p></div></article>
              <article className="stat-card"><span className="stat-icon stat-icon--amber">⌁</span><div><small>Ví đang sử dụng</small><strong>{account ? shortenAddress(account) : "Chưa kết nối"}</strong><p>{role || "Kết nối ví để đọc vai trò"}</p></div></article>
            </section>

            <section className="overview-grid">
              <article className="app-card system-card">
                <div className="card-heading">
                  <div><span className="section-label">TRẠNG THÁI HỆ THỐNG</span><h2>Sẵn sàng vận hành</h2></div>
                  <span className={`health-pill ${databaseOnline ? "online" : "offline"}`}><StatusDot tone={databaseOnline ? "green" : "amber"} />{databaseOnline ? "Hoạt động" : "Cần kiểm tra"}</span>
                </div>
                <div className="health-list">
                  <div><span><StatusDot tone={databaseOnline ? "green" : "amber"} />Backend API</span><strong>{databaseOnline ? "Đã kết nối" : "Chưa kết nối"}</strong></div>
                  <div><span><StatusDot tone="green" />Smart contract</span><a href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">{shortenAddress(CONTRACT_ADDRESS)} ↗</a></div>
                  <div><span><StatusDot tone={account ? "green" : "blue"} />MetaMask</span><strong>{account ? "Đã kết nối" : "Chờ người dùng"}</strong></div>
                </div>
              </article>

              <article className="app-card proof-card">
                <div className="proof-glow" />
                <span className="section-label">BẰNG CHỨNG BLOCKCHAIN</span>
                <h2>Mỗi chuyển giao là một dấu vết không thể sửa đổi.</h2>
                <p>Tra cứu trực tiếp lịch sử đăng ký và chuyển giao được xác nhận trên Ethereum Sepolia.</p>
                <div className="proof-hash"><span>SMART CONTRACT</span><code>{CONTRACT_ADDRESS}</code></div>
                <button type="button" onClick={goToLookup}>Kiểm tra lịch sử <span>→</span></button>
              </article>
            </section>
          </div>
        )}

        {activeTab === "lookup" && (
          <div className="tab-panel page-section">
            <div className="page-heading">
              <div><span className="section-label">TRUY XUẤT NGUỒN GỐC</span><h1>Tra cứu bằng chứng blockchain</h1><p>Nhập mã sản phẩm để xem toàn bộ lịch sử đã được xác nhận trên Sepolia.</p></div>
              <a className="network-chip" href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer"><StatusDot tone="green" /> Smart contract ↗</a>
            </div>
            <ProductHistory />
          </div>
        )}

        {activeTab === "operations" && (
          <div className="tab-panel page-section">
            <div className="page-heading">
              <div><span className="section-label">TRUNG TÂM VẬN HÀNH</span><h1>Quản lý lô hàng</h1><p>Xác thực tài khoản để đăng ký metadata, tạo sản phẩm và chuyển giao quyền nắm giữ.</p></div>
              <div className="network-chip"><StatusDot tone={isSepolia ? "green" : "amber"} /> {isSepolia ? "Ethereum Sepolia" : "Chưa chọn Sepolia"}</div>
            </div>

            {!account && (
              <section className="app-card connect-panel">
                <div className="connect-icon">◆</div><div><h2>Kết nối ví để bắt đầu</h2><p>MetaMask được dùng để xác thực vai trò và ký các giao dịch blockchain.</p></div>
                <button className="metamask-button" type="button" onClick={connectWallet} disabled={busy}>{busy ? "Đang kết nối..." : "Kết nối MetaMask"}</button>
              </section>
            )}

            {account && !isSepolia && (
              <section className="app-card connect-panel warning-panel">
                <div className="connect-icon">!</div><div><h2>Cần chuyển sang mạng Sepolia</h2><p>Ví hiện tại đang ở mạng khác. Chuyển mạng để tiếp tục vận hành.</p></div>
                <button className="primary-button" type="button" onClick={switchToSepolia} disabled={busy}>Chuyển sang Sepolia</button>
              </section>
            )}

            {error && <p className="error" role="alert">{error}</p>}
            {account && isSepolia && (
              <>
                <section className="wallet-summary">
                  <div><small>ĐỊA CHỈ VÍ</small><code>{account}</code></div>
                  <div><small>VAI TRÒ TRÊN HỢP ĐỒNG</small><strong>{role || "Đang đọc quyền..."}</strong></div>
                </section>
                <WalletAuth key={`${account.toLowerCase()}-${chainId}`} account={account} />
              </>
            )}
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span><span className="footer-mark">▰</span> Supply Chain Tracker</span>
        <span>Ethereum Sepolia · Dữ liệu xác minh công khai</span>
      </footer>
    </div>
  );
}
