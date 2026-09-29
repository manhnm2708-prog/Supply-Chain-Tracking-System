import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Luu database trong thu muc backend/data.
const dataDirectory = new URL("./data/", import.meta.url);
mkdirSync(dataDirectory, { recursive: true });

const databasePath = fileURLToPath(
    new URL("./data/supply-chain.sqlite", import.meta.url),
);

export const db = new DatabaseSync(databasePath, {
    timeout: 5000,
});

// Thong tin bo sung cua san pham.
// Khong luu currentCustodian tai day: du lieu nay lay tu blockchain.
db.exec(`
  CREATE TABLE IF NOT EXISTS product_metadata (
    chain_id INTEGER NOT NULL,
    contract_address TEXT NOT NULL,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    manufacturer_address TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (chain_id, contract_address, product_id),

    CHECK (length(product_id) > 0),
    CHECK (length(trim(name)) BETWEEN 1 AND 200),
    CHECK (length(description) <= 5000)
  );
`);

export function listProductMetadata(chainId, contractAddress) {
    return db.prepare(`
    SELECT
      product_id AS productId,
      name,
      description,
      manufacturer_address AS manufacturerAddress,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM product_metadata
    WHERE chain_id = ? AND contract_address = ?
    ORDER BY created_at DESC, product_id ASC
    LIMIT 100
  `).all(chainId, contractAddress.toLowerCase());
}

export function countProductMetadata(chainId, contractAddress) {
    const result = db.prepare(`
    SELECT COUNT(*) AS total
    FROM product_metadata
    WHERE chain_id = ? AND contract_address = ?
  `).get(chainId, contractAddress.toLowerCase());

    return result.total;
}

console.log("SQLite da san sang.");
export function saveProductMetadata({
    chainId,
    contractAddress,
    productId,
    name,
    description,
    manufacturerAddress,
}) {
    db.prepare(`
      INSERT INTO product_metadata (
        chain_id,
        contract_address,
        product_id,
        name,
        description,
        manufacturer_address
      )
      VALUES (?, ?, ?, ?, ?, ?)
  
      ON CONFLICT(chain_id, contract_address, product_id)
      DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        updated_at = CURRENT_TIMESTAMP
    `).run(
        chainId,
        contractAddress.toLowerCase(),
        productId,
        name,
        description,
        manufacturerAddress.toLowerCase(),
    );
}