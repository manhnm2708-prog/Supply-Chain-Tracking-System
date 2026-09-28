import { network } from "hardhat";
import { getAddress, isAddress, zeroAddress } from "viem";

// Dia chi hop dong da trien khai.
const CONTRACT_ADDRESS =
    "0xDdDbE643e31c6662F12E2F03caBD95819a12FE5A";

// Thay BA gia tri ben duoi bang dia chi cong khai tu MetaMask.
const participants = [
    {
        name: "Manufacturer",
        address: "0x430c3A72F51d7e6BA7Cc139aC171af96aca11891",
        role: 1,
    },
    {
        name: "Distributor",
        address: "0xef528E14d4891A062120353f7E32764aC31D9d1c",
        role: 2,
    },
    {
        name: "Seller",
        address: "0x5C0fAeE26a22Bc26080a870Ea82A5570A05DA45c",
        role: 3,
    },
];

async function main() {
    // Kiem tra tat ca dia chi truoc khi gui giao dich.
    const seen = new Set<string>();

    const entries = participants.map((participant) => {
        if (!isAddress(participant.address)) {
            throw new Error(`Dia chi ${participant.name} chua hop le.`);
        }

        const address = getAddress(participant.address);

        if (address === zeroAddress) {
            throw new Error("Khong duoc dung dia chi rong.");
        }

        if (seen.has(address.toLowerCase())) {
            throw new Error("Ba don vi phai dung ba dia chi khac nhau.");
        }

        seen.add(address.toLowerCase());
        return { ...participant, address };
    });

    const { viem } = await network.create();
    const publicClient = await viem.getPublicClient();
    const [adminWallet] = await viem.getWalletClients();

    if ((await publicClient.getChainId()) !== 11155111) {
        throw new Error("Hay chay script voi --network sepolia.");
    }

    if (!adminWallet) {
        throw new Error("Chua cau hinh vi Admin.");
    }

    const code = await publicClient.getCode({
        address: CONTRACT_ADDRESS,
    });

    if (!code || code === "0x") {
        throw new Error("Khong tim thay hop dong tai dia chi nay.");
    }

    const supplyChain = await viem.getContractAt(
        "SupplyChain",
        CONTRACT_ADDRESS,
        { client: { wallet: adminWallet } },
    );

    const contractAdmin = await supplyChain.read.admin();

    if (
        contractAdmin.toLowerCase() !==
        adminWallet.account.address.toLowerCase()
    ) {
        throw new Error("Vi trong keystore khong phai Admin cua hop dong.");
    }

    console.log("Hop dong:", CONTRACT_ADDRESS);
    console.log("Admin:", contractAdmin);

    // Kiem tra vai tro hien tai cua tat ca don vi truoc khi ghi.
    for (const entry of entries) {
        if (entry.address.toLowerCase() === contractAdmin.toLowerCase()) {
            throw new Error(`${entry.name} khong duoc dung dia chi Admin.`);
        }

        const [role] = await supplyChain.read.participants([entry.address]);

        if (Number(role) !== 0 && Number(role) !== entry.role) {
            throw new Error(
                `${entry.name} da co vai tro khac. Hay kiem tra lai dia chi.`,
            );
        }
    }

    // Gui tung giao dich va cho xac nhan.
    for (const entry of entries) {
        const [, active] = await supplyChain.read.participants([
            entry.address,
        ]);

        if (active) {
            console.log(`${entry.name}: da co quyen, bo qua.`);
            continue;
        }

        console.log(`Dang cap quyen cho ${entry.name}...`);

        const hash = await supplyChain.write.authorizeParticipant([
            entry.address,
            entry.role,
        ]);

        console.log("Giao dich:", `https://sepolia.etherscan.io/tx/${hash}`);

        const receipt = await publicClient.waitForTransactionReceipt({
            hash,
        });

        if (receipt.status !== "success") {
            throw new Error(`Cap quyen ${entry.name} that bai.`);
        }

        console.log(`${entry.name}: cap quyen thanh cong.`);
    }

    // Doc lai du lieu blockchain de xac nhan.
    const results = [];

    for (const entry of entries) {
        const [role, active] = await supplyChain.read.participants([
            entry.address,
        ]);

        if (Number(role) !== entry.role || !active) {
            throw new Error(`Ket qua cap quyen ${entry.name} khong dung.`);
        }

        results.push({
            name: entry.name,
            address: entry.address,
            role: Number(role),
            active,
        });
    }

    console.table(results);
    console.log("HOAN THANH: Ca ba don vi da duoc cap quyen.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});