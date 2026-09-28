// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SupplyChain {
    enum Role {
        None,
        Manufacturer,
        Distributor,
        Seller
    }

    struct Participant {
        Role role;
        bool active;
    }

    struct Product {
        string productId;
        address manufacturer;
        address currentCustodian;
        uint256 createdAt;
        bool exists;
    }

    address public immutable admin;

    mapping(address => Participant) public participants;
    mapping(string => Product) private products;

    event ParticipantAuthorized(
        address indexed account,
        Role role
    );

    event ParticipantRevoked(address indexed account);

    event ProductRegistered(
        string productId,
        address indexed manufacturer,
        uint256 timestamp
    );

    event ProductTransferred(
        string productId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyActiveParticipant() {
        require(
            participants[msg.sender].active,
            "Participant is not active"
        );
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function authorizeParticipant(
        address account,
        Role role
    ) external onlyAdmin {
        require(account != address(0), "Invalid address");
        require(account != admin, "Admin is a separate account");
        require(role != Role.None, "Invalid role");

        Participant storage participant = participants[account];

        // Preserve the original role when reauthorizing an account.
        require(
            participant.role == Role.None || participant.role == role,
            "Cannot change assigned role"
        );
        require(!participant.active, "Already active");

        participant.role = role;
        participant.active = true;

        emit ParticipantAuthorized(account, role);
    }

    function revokeParticipant(
        address account
    ) external onlyAdmin {
        require(participants[account].active, "Not active");

        participants[account].active = false;

        emit ParticipantRevoked(account);
    }

    function registerProduct(
        string calldata productId
    ) external onlyActiveParticipant {
        require(
            participants[msg.sender].role == Role.Manufacturer,
            "Only manufacturer"
        );

        require(
            bytes(productId).length > 0 &&
            bytes(productId).length <= 64,
            "Product ID must be 1-64 bytes"
        );

        require(!products[productId].exists, "Product already exists");

        products[productId] = Product({
            productId: productId,
            manufacturer: msg.sender,
            currentCustodian: msg.sender,
            createdAt: block.timestamp,
            exists: true
        });

        emit ProductRegistered(
            productId,
            msg.sender,
            block.timestamp
        );
    }

    function transferProduct(
        string calldata productId,
        address to
    ) external onlyActiveParticipant {
        Product storage product = products[productId];

        require(product.exists, "Product does not exist");
        require(
            product.currentCustodian == msg.sender,
            "Not current custodian"
        );

        require(to != address(0), "Invalid recipient");
        require(to != msg.sender, "Cannot transfer to yourself");
        require(participants[to].active, "Recipient is not active");

        Role senderRole = participants[msg.sender].role;
        Role recipientRole = participants[to].role;

        bool validRoute =
            (
                senderRole == Role.Manufacturer &&
                recipientRole == Role.Distributor
            ) ||
            (
                senderRole == Role.Distributor &&
                recipientRole == Role.Seller
            );

        require(validRoute, "Invalid transfer route");

        product.currentCustodian = to;

        emit ProductTransferred(
            productId,
            msg.sender,
            to,
            block.timestamp
        );
    }

    function getProduct(
        string calldata productId
    ) external view returns (Product memory) {
        require(products[productId].exists, "Product does not exist");

        return products[productId];
    }
}