// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SupplyChain} from "./SupplyChain.sol";

// Interface for Hardhat's testing utilities.
interface SupplyChainVm {
    function prank(address sender) external;
    function expectRevert(bytes calldata reason) external;

    function expectEmit(
        bool checkTopic1,
        bool checkTopic2,
        bool checkTopic3,
        bool checkData,
        address emitter
    ) external;
}

contract SupplyChainTest {
    SupplyChainVm constant vm = SupplyChainVm(
        address(uint160(uint256(keccak256("hevm cheat code"))))
    );

    SupplyChain private supplyChain;

    address private manufacturer = address(0x1001);
    address private distributor = address(0x1002);
    address private seller = address(0x1003);
    address private outsider = address(0x1004);

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

    // Runs before every test, with a fresh contract.
    function setUp() public {
        supplyChain = new SupplyChain();

        supplyChain.authorizeParticipant(
            manufacturer,
            SupplyChain.Role.Manufacturer
        );

        supplyChain.authorizeParticipant(
            distributor,
            SupplyChain.Role.Distributor
        );

        supplyChain.authorizeParticipant(
            seller,
            SupplyChain.Role.Seller
        );
    }

    function _registerProduct() private {
        vm.prank(manufacturer);
        supplyChain.registerProduct("SP001");
    }

    // 1. Admin and participant roles are set correctly.
    function test_AdminAndParticipantRole() public view {
        require(
            supplyChain.admin() == address(this),
            "Wrong admin"
        );

        (SupplyChain.Role role, bool active) =
            supplyChain.participants(manufacturer);

        require(
            role == SupplyChain.Role.Manufacturer,
            "Wrong role"
        );
        require(active, "Manufacturer should be active");
    }

    // 2. A normal account cannot authorize participants.
    function test_NonAdminCannotAuthorize() public {
        vm.expectRevert(bytes("Only admin"));
        vm.prank(outsider);

        supplyChain.authorizeParticipant(
            outsider,
            SupplyChain.Role.Manufacturer
        );
    }

    // 3. Registration saves data and emits the correct event.
    function test_RegisterProductAndEvent() public {
        vm.expectEmit(true, false, false, true, address(supplyChain));
        emit ProductRegistered("SP001", manufacturer, block.timestamp);

        _registerProduct();

        SupplyChain.Product memory product =
            supplyChain.getProduct("SP001");

        require(product.exists, "Product should exist");
        require(
            keccak256(bytes(product.productId)) ==
            keccak256(bytes("SP001")),
            "Wrong product ID"
        );
        require(
            product.manufacturer == manufacturer,
            "Wrong manufacturer"
        );
        require(
            product.currentCustodian == manufacturer,
            "Wrong initial custodian"
        );
        require(
            product.createdAt == block.timestamp,
            "Wrong creation time"
        );
    }

    // 4. A distributor cannot register a new product.
    function test_DistributorCannotRegister() public {
        vm.expectRevert(bytes("Only manufacturer"));
        vm.prank(distributor);
        supplyChain.registerProduct("SP001");
    }

    // 5. Duplicate product IDs are rejected.
    function test_CannotRegisterDuplicateProduct() public {
        _registerProduct();

        vm.expectRevert(bytes("Product already exists"));
        vm.prank(manufacturer);
        supplyChain.registerProduct("SP001");
    }

    // 6. Empty product IDs are rejected.
    function test_CannotRegisterEmptyId() public {
        vm.expectRevert(bytes("Product ID must be 1-64 bytes"));
        vm.prank(manufacturer);
        supplyChain.registerProduct("");
    }

    // 7. The complete route works and both transfers emit events.
    function test_FullTransferRouteAndEvents() public {
        _registerProduct();

        vm.expectEmit(true, true, false, true, address(supplyChain));
        emit ProductTransferred(
            "SP001", manufacturer, distributor, block.timestamp
        );

        vm.prank(manufacturer);
        supplyChain.transferProduct("SP001", distributor);

        SupplyChain.Product memory product =
            supplyChain.getProduct("SP001");

        require(
            product.currentCustodian == distributor,
            "Distributor should hold product"
        );

        vm.expectEmit(true, true, false, true, address(supplyChain));
        emit ProductTransferred(
            "SP001", distributor, seller, block.timestamp
        );

        vm.prank(distributor);
        supplyChain.transferProduct("SP001", seller);

        product = supplyChain.getProduct("SP001");

        require(
            product.currentCustodian == seller,
            "Seller should hold product"
        );
        require(
            product.manufacturer == manufacturer,
            "Original manufacturer must remain unchanged"
        );
    }

    // 8. The previous custodian cannot transfer again.
    function test_PreviousCustodianCannotTransfer() public {
        _registerProduct();

        vm.prank(manufacturer);
        supplyChain.transferProduct("SP001", distributor);

        vm.expectRevert(bytes("Not current custodian"));
        vm.prank(manufacturer);
        supplyChain.transferProduct("SP001", distributor);

        SupplyChain.Product memory product =
            supplyChain.getProduct("SP001");

        require(
            product.currentCustodian == distributor,
            "Failed transfer must not change custodian"
        );
    }

    // 9. Manufacturer cannot skip distributor and send to seller.
    function test_CannotSkipDistributor() public {
        _registerProduct();

        vm.expectRevert(bytes("Invalid transfer route"));
        vm.prank(manufacturer);
        supplyChain.transferProduct("SP001", seller);
    }

    // 10. Recipient must be authorized.
    function test_CannotTransferToUnauthorizedRecipient() public {
        _registerProduct();

        vm.expectRevert(bytes("Recipient is not active"));
        vm.prank(manufacturer);
        supplyChain.transferProduct("SP001", outsider);
    }

    // 11. Revocation blocks transfers; reauthorization restores them.
    function test_RevokeAndReactivateParticipant() public {
        _registerProduct();

        supplyChain.revokeParticipant(manufacturer);

        (, bool active) = supplyChain.participants(manufacturer);
        require(!active, "Participant should be inactive");

        vm.expectRevert(bytes("Participant is not active"));
        vm.prank(manufacturer);
        supplyChain.transferProduct("SP001", distributor);

        SupplyChain.Product memory product =
            supplyChain.getProduct("SP001");

        require(
            product.currentCustodian == manufacturer,
            "Revocation must not change custodian"
        );

        supplyChain.authorizeParticipant(
            manufacturer,
            SupplyChain.Role.Manufacturer
        );

        vm.prank(manufacturer);
        supplyChain.transferProduct("SP001", distributor);

        product = supplyChain.getProduct("SP001");
        require(
            product.currentCustodian == distributor,
            "Transfer should work after reactivation"
        );
    }

    // 12. A participant cannot be reassigned to another role.
    function test_CannotChangeAssignedRole() public {
        supplyChain.revokeParticipant(manufacturer);

        vm.expectRevert(bytes("Cannot change assigned role"));
        supplyChain.authorizeParticipant(
            manufacturer,
            SupplyChain.Role.Distributor
        );
    }
}