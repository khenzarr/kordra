// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PaymentAuthority
 * @notice Immutable one-time delegated payment escrow.
 *         A sponsor locks USDC at instruction creation. Only the designated
 *         spender may execute the payment (to a fixed recipient, exact amount)
 *         before expiry. Only the sponsor may reclaim funds after expiry.
 *         Expiry must be within 30 days of creation.
 *         No admin, no fees, no upgrade, no oracle, no partial payments.
 */
contract PaymentAuthority is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAddress();
    error ZeroAmount();
    error ExpiryInPast();
    error ExpiryTooFar();
    error NotSpender();
    error NotSponsor();
    error AlreadyExecuted();
    error AlreadyReclaimed();
    error NotExpired();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event InstructionCreated(
        uint256 indexed id,
        address indexed sponsor,
        address indexed spender,
        address recipient,
        uint256 amount,
        uint256 expiry,
        bytes32 refHash
    );

    event PaymentExecuted(
        uint256 indexed id,
        address indexed spender,
        address indexed recipient,
        uint256 amount
    );

    event FundsReclaimed(
        uint256 indexed id,
        address indexed sponsor,
        uint256 amount
    );

    // -------------------------------------------------------------------------
    // Data
    // -------------------------------------------------------------------------

    struct Instruction {
        address sponsor;
        address spender;
        address recipient;
        uint256 amount;
        uint256 expiry;
        bytes32 refHash;
        bool executed;
        bool reclaimed;
    }

    /// @notice The USDC ERC-20 token contract (immutable after construction).
    IERC20 public immutable usdcToken;

    /// @dev Monotonically increasing instruction counter; first ID is 1.
    uint256 private _nextInstructionId = 1;

    mapping(uint256 => Instruction) private _instructions;

    // -------------------------------------------------------------------------
    // Errors (additional)
    // -------------------------------------------------------------------------

    error WrongToken();
    error WrongChain();

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Arc USDC address (same on Arc Testnet and Arc Mainnet).
    address public constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    /// @notice Arc Testnet chain ID.
    uint256 public constant ARC_TESTNET_CHAIN_ID = 5042002;

    /// @notice Arc Mainnet chain ID.
    uint256 public constant ARC_MAINNET_CHAIN_ID = 5042;

    /// @notice Maximum allowed expiry window: 30 days after block.timestamp at creation.
    uint256 public constant MAX_EXPIRY_WINDOW = 30 days;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param usdcToken_  Must equal the Arc USDC address.
     *                    Passed explicitly so the contract is verifiable but
     *                    still fails loudly on a wrong-token deployment.
     */
    constructor(address usdcToken_) {
        // Enforce deployment target: Arc Testnet or Arc Mainnet only.
        if (block.chainid != ARC_TESTNET_CHAIN_ID && block.chainid != ARC_MAINNET_CHAIN_ID) {
            revert WrongChain();
        }
        if (usdcToken_ == address(0)) revert ZeroAddress();
        if (usdcToken_ != ARC_USDC) revert WrongToken();
        usdcToken = IERC20(usdcToken_);
    }

    // -------------------------------------------------------------------------
    // External functions
    // -------------------------------------------------------------------------

    /**
     * @notice Create a new payment instruction and lock the USDC.
     * @dev Caller must have approved this contract for `amount` USDC beforehand.
     * @param spender    Address authorised to execute the payment (exactly once, before expiry).
     * @param recipient  Fixed destination for the USDC.
     * @param amount     Exact USDC amount (6 decimals) to lock and later pay.
     * @param expiry     Unix timestamp after which the sponsor may reclaim.
     *                   Must be > block.timestamp and <= block.timestamp + 30 days.
     * @param refHash    Optional opaque reference (e.g. keccak256 of an invoice ID). Pass bytes32(0) if unused.
     * @return id        The new instruction ID (starts at 1).
     */
    function createInstruction(
        address spender,
        address recipient,
        uint256 amount,
        uint256 expiry,
        bytes32 refHash
    ) external nonReentrant returns (uint256 id) {
        if (spender == address(0) || recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (expiry <= block.timestamp) revert ExpiryInPast();
        if (expiry > block.timestamp + MAX_EXPIRY_WINDOW) revert ExpiryTooFar();

        address sponsor = msg.sender;

        // Assign ID and advance counter before any external call (CEI).
        id = _nextInstructionId;
        unchecked { _nextInstructionId = id + 1; }

        _instructions[id] = Instruction({
            sponsor: sponsor,
            spender: spender,
            recipient: recipient,
            amount: amount,
            expiry: expiry,
            refHash: refHash,
            executed: false,
            reclaimed: false
        });

        // Pull USDC from sponsor into this contract. SafeERC20 reverts on failure.
        usdcToken.safeTransferFrom(sponsor, address(this), amount);

        emit InstructionCreated(
            id,
            sponsor,
            spender,
            recipient,
            amount,
            expiry,
            refHash
        );
    }

    /**
     * @notice Execute the payment. Sends USDC to the fixed recipient.
     * @dev Only callable by the designated spender, before expiry, and exactly once.
     * @param id  Instruction ID.
     */
    function execute(uint256 id) external nonReentrant {
        Instruction storage inst = _instructions[id];

        if (msg.sender != inst.spender) revert NotSpender();
        if (inst.executed) revert AlreadyExecuted();
        if (inst.reclaimed) revert AlreadyReclaimed();
        if (block.timestamp >= inst.expiry) revert ExpiryInPast();

        // Effects before interaction (CEI).
        inst.executed = true;

        address recipient = inst.recipient;
        uint256 amount = inst.amount;

        usdcToken.safeTransfer(recipient, amount);

        emit PaymentExecuted(id, msg.sender, recipient, amount);
    }

    /**
     * @notice Reclaim locked USDC after the instruction has expired without execution.
     * @dev Only callable by the original sponsor, after expiry.
     * @param id  Instruction ID.
     */
    function reclaim(uint256 id) external nonReentrant {
        Instruction storage inst = _instructions[id];

        if (msg.sender != inst.sponsor) revert NotSponsor();
        if (inst.executed) revert AlreadyExecuted();
        if (inst.reclaimed) revert AlreadyReclaimed();
        if (block.timestamp < inst.expiry) revert NotExpired();

        // Effects before interaction (CEI).
        inst.reclaimed = true;

        address sponsor = inst.sponsor;
        uint256 amount = inst.amount;

        usdcToken.safeTransfer(sponsor, amount);

        emit FundsReclaimed(id, sponsor, amount);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /**
     * @notice Return the full state of an instruction.
     * @param id  Instruction ID.
     */
    function getInstruction(uint256 id)
        external
        view
        returns (Instruction memory)
    {
        return _instructions[id];
    }

    /**
     * @notice Return the next instruction ID that will be assigned.
     */
    function nextInstructionId() external view returns (uint256) {
        return _nextInstructionId;
    }
}
