// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {PaymentAuthority} from "../PaymentAuthority.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ---------------------------------------------------------------------------
// Minimal ERC-20 mock — deployed at the Arc USDC address via vm.etch
// ---------------------------------------------------------------------------
contract MockUSDC {
    string public name     = "USD Coin";
    string public symbol   = "USDC";
    uint8  public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
contract PaymentAuthorityTest is Test {

    // Arc USDC address — must be etched exactly here.
    address constant ARC_USDC      = 0x3600000000000000000000000000000000000000;
    uint256 constant ARC_TESTNET   = 5042002;
    uint256 constant ARC_MAINNET   = 5042;

    // Test actors
    address sponsor   = makeAddr("sponsor");
    address spender   = makeAddr("spender");
    address recipient = makeAddr("recipient");
    address stranger  = makeAddr("stranger");

    PaymentAuthority pa;
    MockUSDC         usdc;

    // -----------------------------------------------------------------------
    // Setup — etch mock USDC at the canonical Arc address, deploy contract
    // -----------------------------------------------------------------------
    function setUp() public {
        // Set chain to Arc Testnet so the constructor passes.
        vm.chainId(ARC_TESTNET);

        // Deploy mock and etch its bytecode at the canonical Arc USDC address.
        MockUSDC deployed = new MockUSDC();
        vm.etch(ARC_USDC, address(deployed).code);
        usdc = MockUSDC(ARC_USDC);

        pa = new PaymentAuthority(ARC_USDC);

        // Fund the sponsor with 1 000 USDC (6 decimals = 1_000_000_000).
        usdc.mint(sponsor, 1_000_000_000);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /// Approve + create a standard instruction; returns the instruction ID.
    function _create(
        address _spender,
        address _recipient,
        uint256 _amount,
        uint256 _expiry,
        bytes32 _ref
    ) internal returns (uint256 id) {
        vm.startPrank(sponsor);
        usdc.approve(address(pa), _amount);
        id = pa.createInstruction(_spender, _recipient, _amount, _expiry, _ref);
        vm.stopPrank();
    }

    /// Standard expiry: 1 day from now.
    function _expiry() internal view returns (uint256) {
        return block.timestamp + 1 days;
    }

    // -----------------------------------------------------------------------
    // 1. Happy path: createInstruction
    // -----------------------------------------------------------------------
    function test_create_happyPath() public {
        uint256 amount = 100_000_000; // 100 USDC
        uint256 expiry = _expiry();
        bytes32 ref    = keccak256("invoice-001");

        uint256 sponsorBefore   = usdc.balanceOf(sponsor);
        uint256 contractBefore  = usdc.balanceOf(address(pa));

        // Approve first (separate prank so expectEmit fires on the correct emit).
        vm.prank(sponsor);
        usdc.approve(address(pa), amount);

        vm.expectEmit(true, true, true, true);
        emit PaymentAuthority.InstructionCreated(1, sponsor, spender, recipient, amount, expiry, ref);

        vm.prank(sponsor);
        uint256 id = pa.createInstruction(spender, recipient, amount, expiry, ref);

        assertEq(id, 1);
        assertEq(pa.nextInstructionId(), 2);
        assertEq(usdc.balanceOf(sponsor),      sponsorBefore  - amount);
        assertEq(usdc.balanceOf(address(pa)),  contractBefore + amount);

        PaymentAuthority.Instruction memory inst = pa.getInstruction(1);
        assertEq(inst.sponsor,    sponsor);
        assertEq(inst.spender,    spender);
        assertEq(inst.recipient,  recipient);
        assertEq(inst.amount,     amount);
        assertEq(inst.expiry,     expiry);
        assertEq(inst.refHash,    ref);
        assertFalse(inst.executed);
        assertFalse(inst.reclaimed);
    }

    // -----------------------------------------------------------------------
    // 2. Happy path: execute
    // -----------------------------------------------------------------------
    function test_execute_happyPath() public {
        uint256 amount = 50_000_000; // 50 USDC
        uint256 id = _create(spender, recipient, amount, _expiry(), bytes32(0));

        uint256 recipientBefore = usdc.balanceOf(recipient);
        uint256 contractBefore  = usdc.balanceOf(address(pa));

        vm.expectEmit(true, true, true, true);
        emit PaymentAuthority.PaymentExecuted(id, spender, recipient, amount);

        vm.prank(spender);
        pa.execute(id);

        assertEq(usdc.balanceOf(recipient),   recipientBefore + amount);
        assertEq(usdc.balanceOf(address(pa)), contractBefore  - amount);
        assertTrue(pa.getInstruction(id).executed);
    }

    // -----------------------------------------------------------------------
    // 3. Happy path: reclaim after expiry
    // -----------------------------------------------------------------------
    function test_reclaim_afterExpiry() public {
        uint256 amount = 25_000_000; // 25 USDC
        uint256 expiry = block.timestamp + 2 days;
        uint256 id = _create(spender, recipient, amount, expiry, bytes32(0));

        uint256 sponsorBefore  = usdc.balanceOf(sponsor);
        uint256 contractBefore = usdc.balanceOf(address(pa));

        // Warp past expiry.
        vm.warp(expiry + 1);

        vm.expectEmit(true, true, false, true);
        emit PaymentAuthority.FundsReclaimed(id, sponsor, amount);

        vm.prank(sponsor);
        pa.reclaim(id);

        assertEq(usdc.balanceOf(sponsor),     sponsorBefore  + amount);
        assertEq(usdc.balanceOf(address(pa)), contractBefore - amount);
        assertTrue(pa.getInstruction(id).reclaimed);
    }

    // -----------------------------------------------------------------------
    // 4. Unauthorized execute: stranger
    // -----------------------------------------------------------------------
    function test_execute_unauthorizedStranger() public {
        uint256 id = _create(spender, recipient, 10_000_000, _expiry(), bytes32(0));
        vm.prank(stranger);
        vm.expectRevert(PaymentAuthority.NotSpender.selector);
        pa.execute(id);
    }

    // -----------------------------------------------------------------------
    // 5. Unauthorized execute: sponsor cannot execute (they are not the spender)
    // -----------------------------------------------------------------------
    function test_execute_sponsorIsNotSpender() public {
        uint256 id = _create(spender, recipient, 10_000_000, _expiry(), bytes32(0));
        vm.prank(sponsor);
        vm.expectRevert(PaymentAuthority.NotSpender.selector);
        pa.execute(id);
    }

    // -----------------------------------------------------------------------
    // 6. Unauthorized reclaim: stranger
    // -----------------------------------------------------------------------
    function test_reclaim_unauthorizedStranger() public {
        uint256 expiry = block.timestamp + 2 days;
        uint256 id = _create(spender, recipient, 10_000_000, expiry, bytes32(0));
        vm.warp(expiry + 1);
        vm.prank(stranger);
        vm.expectRevert(PaymentAuthority.NotSponsor.selector);
        pa.reclaim(id);
    }

    // -----------------------------------------------------------------------
    // 7. Duplicate execute
    // -----------------------------------------------------------------------
    function test_execute_duplicate() public {
        uint256 id = _create(spender, recipient, 10_000_000, _expiry(), bytes32(0));
        vm.prank(spender);
        pa.execute(id);

        vm.prank(spender);
        vm.expectRevert(PaymentAuthority.AlreadyExecuted.selector);
        pa.execute(id);
    }

    // -----------------------------------------------------------------------
    // 8. Duplicate reclaim
    // -----------------------------------------------------------------------
    function test_reclaim_duplicate() public {
        uint256 expiry = block.timestamp + 2 days;
        uint256 id = _create(spender, recipient, 10_000_000, expiry, bytes32(0));
        vm.warp(expiry + 1);

        vm.prank(sponsor);
        pa.reclaim(id);

        vm.prank(sponsor);
        vm.expectRevert(PaymentAuthority.AlreadyReclaimed.selector);
        pa.reclaim(id);
    }

    // -----------------------------------------------------------------------
    // 9. Execute after reclaim
    // -----------------------------------------------------------------------
    function test_execute_afterReclaim() public {
        uint256 expiry = block.timestamp + 2 days;
        uint256 id = _create(spender, recipient, 10_000_000, expiry, bytes32(0));
        vm.warp(expiry + 1);

        vm.prank(sponsor);
        pa.reclaim(id);

        vm.warp(expiry - 1); // warp back — still AlreadyReclaimed
        vm.prank(spender);
        vm.expectRevert(PaymentAuthority.AlreadyReclaimed.selector);
        pa.execute(id);
    }

    // -----------------------------------------------------------------------
    // 10. Reclaim after execute
    // -----------------------------------------------------------------------
    function test_reclaim_afterExecute() public {
        uint256 expiry = block.timestamp + 2 days;
        uint256 id = _create(spender, recipient, 10_000_000, expiry, bytes32(0));

        vm.prank(spender);
        pa.execute(id);

        vm.warp(expiry + 1);
        vm.prank(sponsor);
        vm.expectRevert(PaymentAuthority.AlreadyExecuted.selector);
        pa.reclaim(id);
    }

    // -----------------------------------------------------------------------
    // 11. Execute after expiry
    // -----------------------------------------------------------------------
    function test_execute_afterExpiry() public {
        uint256 expiry = block.timestamp + 1 hours;
        uint256 id = _create(spender, recipient, 10_000_000, expiry, bytes32(0));

        vm.warp(expiry); // at exact expiry — should revert (>=)
        vm.prank(spender);
        vm.expectRevert(PaymentAuthority.ExpiryInPast.selector);
        pa.execute(id);
    }

    // -----------------------------------------------------------------------
    // 12. Reclaim before expiry
    // -----------------------------------------------------------------------
    function test_reclaim_beforeExpiry() public {
        uint256 expiry = block.timestamp + 3 days;
        uint256 id = _create(spender, recipient, 10_000_000, expiry, bytes32(0));

        vm.prank(sponsor);
        vm.expectRevert(PaymentAuthority.NotExpired.selector);
        pa.reclaim(id);
    }

    // -----------------------------------------------------------------------
    // 13. Invalid inputs: zero addresses
    // -----------------------------------------------------------------------
    function test_create_zeroSpender() public {
        vm.startPrank(sponsor);
        usdc.approve(address(pa), 1_000_000);
        vm.expectRevert(PaymentAuthority.ZeroAddress.selector);
        pa.createInstruction(address(0), recipient, 1_000_000, _expiry(), bytes32(0));
        vm.stopPrank();
    }

    function test_create_zeroRecipient() public {
        vm.startPrank(sponsor);
        usdc.approve(address(pa), 1_000_000);
        vm.expectRevert(PaymentAuthority.ZeroAddress.selector);
        pa.createInstruction(spender, address(0), 1_000_000, _expiry(), bytes32(0));
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // 14. Invalid inputs: zero amount
    // -----------------------------------------------------------------------
    function test_create_zeroAmount() public {
        vm.startPrank(sponsor);
        usdc.approve(address(pa), 1_000_000);
        vm.expectRevert(PaymentAuthority.ZeroAmount.selector);
        pa.createInstruction(spender, recipient, 0, _expiry(), bytes32(0));
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // 15. Invalid inputs: expiry in the past
    // -----------------------------------------------------------------------
    function test_create_expiryInPast() public {
        vm.startPrank(sponsor);
        usdc.approve(address(pa), 1_000_000);
        vm.expectRevert(PaymentAuthority.ExpiryInPast.selector);
        pa.createInstruction(spender, recipient, 1_000_000, block.timestamp - 1, bytes32(0));
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // 16. Boundary timestamp: expiry == block.timestamp reverts
    // -----------------------------------------------------------------------
    function test_create_expiryAtTimestamp_reverts() public {
        vm.startPrank(sponsor);
        usdc.approve(address(pa), 1_000_000);
        vm.expectRevert(PaymentAuthority.ExpiryInPast.selector);
        pa.createInstruction(spender, recipient, 1_000_000, block.timestamp, bytes32(0));
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // 17. Boundary timestamp: expiry == block.timestamp + 1 succeeds
    // -----------------------------------------------------------------------
    function test_create_expiryPlusOne_succeeds() public {
        uint256 id = _create(spender, recipient, 1_000_000, block.timestamp + 1, bytes32(0));
        assertEq(id, 1);
    }

    // -----------------------------------------------------------------------
    // 18. Execute: boundary — at expiry-1 succeeds, at expiry reverts
    // -----------------------------------------------------------------------
    function test_execute_atExpiryMinusOne_succeeds() public {
        uint256 expiry = block.timestamp + 100;
        uint256 id = _create(spender, recipient, 1_000_000, expiry, bytes32(0));

        vm.warp(expiry - 1);
        vm.prank(spender);
        pa.execute(id); // must succeed
        assertTrue(pa.getInstruction(id).executed);
    }

    // -----------------------------------------------------------------------
    // 19. Reclaim: boundary — at expiry reverts, at expiry+1 succeeds
    // -----------------------------------------------------------------------
    function test_reclaim_atExpiry_reverts() public {
        uint256 expiry = block.timestamp + 100;
        uint256 id = _create(spender, recipient, 1_000_000, expiry, bytes32(0));

        vm.warp(expiry - 1); // one second before — NotExpired
        vm.prank(sponsor);
        vm.expectRevert(PaymentAuthority.NotExpired.selector);
        pa.reclaim(id);
    }

    function test_reclaim_atExpiryPlusOne_succeeds() public {
        uint256 expiry = block.timestamp + 100;
        uint256 id = _create(spender, recipient, 1_000_000, expiry, bytes32(0));

        vm.warp(expiry); // at expiry: block.timestamp < inst.expiry is false (equal), so succeeds
        vm.prank(sponsor);
        pa.reclaim(id);
        assertTrue(pa.getInstruction(id).reclaimed);
    }

    // -----------------------------------------------------------------------
    // 20. Exact 6-decimal balance changes: 1 USDC
    // -----------------------------------------------------------------------
    function test_balanceChange_oneUsdc() public {
        uint256 amount = 1_000_000; // 1.000000 USDC
        uint256 before = usdc.balanceOf(sponsor);
        uint256 id = _create(spender, recipient, amount, _expiry(), bytes32(0));
        assertEq(usdc.balanceOf(sponsor), before - amount, "sponsor -1 USDC");
        assertEq(usdc.balanceOf(address(pa)), amount, "contract +1 USDC");

        vm.prank(spender);
        pa.execute(id);
        assertEq(usdc.balanceOf(recipient), amount, "recipient +1 USDC");
        assertEq(usdc.balanceOf(address(pa)), 0, "contract 0 USDC");
    }

    // -----------------------------------------------------------------------
    // 21. Exact 6-decimal balance changes: smallest unit (1 = 0.000001 USDC)
    // -----------------------------------------------------------------------
    function test_balanceChange_oneUnit() public {
        uint256 amount = 1; // 0.000001 USDC
        uint256 before = usdc.balanceOf(sponsor);
        uint256 id = _create(spender, recipient, amount, _expiry(), bytes32(0));
        assertEq(usdc.balanceOf(sponsor), before - 1);
        assertEq(usdc.balanceOf(address(pa)), 1);

        vm.prank(spender);
        pa.execute(id);
        assertEq(usdc.balanceOf(recipient), 1);
        assertEq(usdc.balanceOf(address(pa)), 0);
    }

    // -----------------------------------------------------------------------
    // 22. Exact 6-decimal balance changes: 999_999 (0.999999 USDC)
    // -----------------------------------------------------------------------
    function test_balanceChange_999999Units() public {
        uint256 amount = 999_999;
        uint256 before = usdc.balanceOf(sponsor);
        uint256 id = _create(spender, recipient, amount, _expiry(), bytes32(0));
        assertEq(usdc.balanceOf(sponsor), before - amount);
        assertEq(usdc.balanceOf(address(pa)), amount);

        vm.prank(spender);
        pa.execute(id);
        assertEq(usdc.balanceOf(recipient), amount);
        assertEq(usdc.balanceOf(address(pa)), 0);
    }

    // -----------------------------------------------------------------------
    // 23. Multiple independent instructions coexist correctly
    // -----------------------------------------------------------------------
    function test_multipleInstructions_independent() public {
        // Create two instructions from the same sponsor with different spenders
        address spender2   = makeAddr("spender2");
        address recipient2 = makeAddr("recipient2");

        uint256 id1 = _create(spender,  recipient,  10_000_000, _expiry(), bytes32(0));
        uint256 id2 = _create(spender2, recipient2, 20_000_000, _expiry(), bytes32(0));

        assertEq(id1, 1);
        assertEq(id2, 2);

        // Execute only id2
        vm.prank(spender2);
        pa.execute(id2);

        // id1 is untouched
        PaymentAuthority.Instruction memory inst1 = pa.getInstruction(id1);
        assertFalse(inst1.executed);
        assertFalse(inst1.reclaimed);

        // id2 is executed
        assertTrue(pa.getInstruction(id2).executed);
    }

    // -----------------------------------------------------------------------
    // 24. Wrong chain: constructor reverts with WrongChain
    // -----------------------------------------------------------------------
    function test_constructor_wrongChain() public {
        vm.chainId(1); // Ethereum mainnet — not Arc
        vm.expectRevert(PaymentAuthority.WrongChain.selector);
        new PaymentAuthority(ARC_USDC);
    }

    // -----------------------------------------------------------------------
    // 25. Wrong chain: Arc Mainnet (5042) is accepted
    // -----------------------------------------------------------------------
    function test_constructor_arcMainnetAccepted() public {
        vm.chainId(5042);
        PaymentAuthority pa2 = new PaymentAuthority(ARC_USDC);
        assertEq(address(pa2.usdcToken()), ARC_USDC);
    }

    // -----------------------------------------------------------------------
    // 26. Wrong token: constructor reverts with WrongToken
    // -----------------------------------------------------------------------
    function test_constructor_wrongToken() public {
        vm.chainId(ARC_TESTNET);
        address fakeToken = makeAddr("fakeToken");
        vm.expectRevert(PaymentAuthority.WrongToken.selector);
        new PaymentAuthority(fakeToken);
    }

    // -----------------------------------------------------------------------
    // 27. Wrong token: zero address reverts with ZeroAddress (checked before WrongToken)
    // -----------------------------------------------------------------------
    function test_constructor_zeroToken() public {
        vm.chainId(ARC_TESTNET);
        vm.expectRevert(PaymentAuthority.ZeroAddress.selector);
        new PaymentAuthority(address(0));
    }

    // -----------------------------------------------------------------------
    // 28. Fuzz: any amount > 0 and future expiry within the 30-day cap
    // -----------------------------------------------------------------------
    function testFuzz_create(uint96 amount, uint32 futureOffset) public {
        vm.assume(amount > 0);
        // Clamp offset to [1, MAX_EXPIRY_WINDOW] so it never exceeds the cap.
        uint256 offset = uint256(futureOffset) % pa.MAX_EXPIRY_WINDOW();
        vm.assume(offset > 0);
        uint256 expiry = block.timestamp + offset;

        usdc.mint(sponsor, amount);
        vm.startPrank(sponsor);
        usdc.approve(address(pa), amount);
        uint256 id = pa.createInstruction(spender, recipient, amount, expiry, bytes32(0));
        vm.stopPrank();

        assertGt(id, 0);
        assertEq(pa.getInstruction(id).amount, amount);
    }

    // -----------------------------------------------------------------------
    // 29. Fuzz: refHash is stored verbatim
    // -----------------------------------------------------------------------
    function testFuzz_refHash(bytes32 ref) public {
        uint256 id = _create(spender, recipient, 1_000_000, _expiry(), ref);
        assertEq(pa.getInstruction(id).refHash, ref);
    }

    // -----------------------------------------------------------------------
    // 30. Expiry exactly at 30 days: MUST succeed (boundary inclusive)
    // -----------------------------------------------------------------------
    function test_create_expiryExactly30Days_succeeds() public {
        uint256 expiry = block.timestamp + pa.MAX_EXPIRY_WINDOW(); // == block.timestamp + 30 days
        uint256 amount = 1_000_000;

        vm.prank(sponsor);
        usdc.approve(address(pa), amount);

        vm.prank(sponsor);
        uint256 id = pa.createInstruction(spender, recipient, amount, expiry, bytes32(0));

        assertGt(id, 0);
        assertEq(pa.getInstruction(id).expiry, expiry);
    }

    // -----------------------------------------------------------------------
    // 31. Expiry one second past 30 days: MUST revert with ExpiryTooFar
    // -----------------------------------------------------------------------
    function test_create_expiry30DaysPlusOneSecond_reverts() public {
        uint256 expiry = block.timestamp + pa.MAX_EXPIRY_WINDOW() + 1; // one second over cap

        vm.prank(sponsor);
        usdc.approve(address(pa), 1_000_000);

        vm.prank(sponsor);
        vm.expectRevert(PaymentAuthority.ExpiryTooFar.selector);
        pa.createInstruction(spender, recipient, 1_000_000, expiry, bytes32(0));
    }

    // -----------------------------------------------------------------------
    // 32. Expiry one second before 30 days: MUST succeed
    // -----------------------------------------------------------------------
    function test_create_expiry30DaysMinusOneSecond_succeeds() public {
        uint256 expiry = block.timestamp + pa.MAX_EXPIRY_WINDOW() - 1;
        uint256 amount = 1_000_000;

        vm.prank(sponsor);
        usdc.approve(address(pa), amount);

        vm.prank(sponsor);
        uint256 id = pa.createInstruction(spender, recipient, amount, expiry, bytes32(0));

        assertGt(id, 0);
        assertEq(pa.getInstruction(id).expiry, expiry);
    }

    // -----------------------------------------------------------------------
    // 33. Fuzz: expiry > 30 days always reverts with ExpiryTooFar
    // -----------------------------------------------------------------------
    function testFuzz_expiryOverCap_reverts(uint32 overBy) public {
        vm.assume(overBy > 0);
        uint256 expiry = block.timestamp + pa.MAX_EXPIRY_WINDOW() + uint256(overBy);

        vm.prank(sponsor);
        usdc.approve(address(pa), 1_000_000);

        vm.prank(sponsor);
        vm.expectRevert(PaymentAuthority.ExpiryTooFar.selector);
        pa.createInstruction(spender, recipient, 1_000_000, expiry, bytes32(0));
    }
}
