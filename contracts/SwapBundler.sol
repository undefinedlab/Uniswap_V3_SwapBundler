// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./SimpleSwapRouter.sol";

/**
 * @title SwapBundler
 */
contract SwapBundler {
    using SafeERC20 for IERC20;

    SimpleSwapRouter public immutable router;
    
    // Events
    event SwapBundled(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 bundleId
    );

    constructor(address _router) {
        require(_router != address(0), "Invalid router");
        router = SimpleSwapRouter(_router);
    }

    /**
     * @notice Execute a swap through the bundler 
     * @param pool The Uniswap v3 pool address
     * @param weth The WETH contract address
     * @param params Swap parameters
     * @return amountOut The amount of output tokens received
     */
    function bundleSwap(
        address pool,
        address weth,
        SimpleSwapRouter.ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut) {
        require(msg.value > 0, "Must send ETH");
        require(params.tokenIn == weth, "tokenIn must be WETH");
        
        // Generate a bundle ID for tracking
        bytes32 bundleId = keccak256(
            abi.encodePacked(
                block.timestamp,
                block.number,
                msg.sender,
                params.amountIn
            )
        );

        // Execute the swap through the router
        // The router will receive ETH from this contract, wrap it, and execute the swap
        // The router sends output tokens directly to params.recipient (the original caller)
        amountOut = router.exactInputSingleWithETH{value: msg.value}(
            pool,
            weth,
            params
        );
        
        // Note: Output tokens are already sent to params.recipient by the router
        // No need to transfer again

        emit SwapBundled(
            msg.sender,
            params.tokenIn,
            params.tokenOut,
            params.amountIn,
            amountOut,
            bundleId
        );
    }

    /**
     * @notice Execute multiple swaps in a single transaction (true batching)
     * @param swaps Array of swap operations
     * @return results Array of output amounts for each swap
     */
    function bundleSwaps(
        address pool,
        address weth,
        SimpleSwapRouter.ExactInputSingleParams[] calldata swaps
    ) external payable returns (uint256[] memory results) {
        require(swaps.length > 0, "No swaps provided");
        
        uint256 totalValue = 0;
        for (uint256 i = 0; i < swaps.length; i++) {
            totalValue += swaps[i].amountIn;
        }
        require(msg.value >= totalValue, "Insufficient ETH");

        results = new uint256[](swaps.length);
        uint256 remainingValue = msg.value;

        for (uint256 i = 0; i < swaps.length; i++) {
            require(swaps[i].tokenIn == weth, "tokenIn must be WETH");
            
            // Execute swap
            results[i] = router.exactInputSingleWithETH{value: swaps[i].amountIn}(
                pool,
                weth,
                swaps[i]
            );

            // Transfer output to recipient
            if (swaps[i].tokenOut != address(0)) {
                IERC20(swaps[i].tokenOut).safeTransfer(
                    swaps[i].recipient,
                    results[i]
                );
            }

            remainingValue -= swaps[i].amountIn;
        }

        // Refund any excess ETH
        if (remainingValue > 0) {
            payable(msg.sender).transfer(remainingValue);
        }
    }

    /**
     * @notice Execute a swap with additional obfuscation (dummy operations)
     * @param pool The Uniswap v3 pool address
     * @param weth The WETH contract address
     * @param params Swap parameters
     * @param dummyOps Number of dummy operations to add (for obfuscation)
     * @return amountOut The amount of output tokens received
     */
    function bundleSwapWithObfuscation(
        address pool,
        address weth,
        SimpleSwapRouter.ExactInputSingleParams calldata params,
        uint256 dummyOps
    ) external payable returns (uint256 amountOut) {
        // Execute dummy operations to obfuscate the real swap
        for (uint256 i = 0; i < dummyOps && i < 10; i++) {
            // Simple dummy operation (just a storage write)
            uint256 dummy = block.timestamp + i;
            dummy = dummy * 2; // Prevent optimization
        }

        // Execute the actual swap (reuse bundleSwap logic)
        require(msg.value > 0, "Must send ETH");
        require(params.tokenIn == weth, "tokenIn must be WETH");
        
        bytes32 bundleId = keccak256(
            abi.encodePacked(
                block.timestamp,
                block.number,
                msg.sender,
                params.amountIn
            )
        );

        amountOut = router.exactInputSingleWithETH{value: msg.value}(
            pool,
            weth,
            params
        );

        if (params.tokenOut != address(0)) {
            IERC20(params.tokenOut).safeTransfer(
                params.recipient,
                amountOut
            );
        }

        emit SwapBundled(
            msg.sender,
            params.tokenIn,
            params.tokenOut,
            params.amountIn,
            amountOut,
            bundleId
        );
    }

    /**
     * @notice Withdraw any tokens accidentally sent to this contract
     * @param token Token address (address(0) for ETH)
     * @param to Recipient address
     */
    function withdraw(address token, address to) external {
        require(to != address(0), "Invalid recipient");
        
        if (token == address(0)) {
            payable(to).transfer(address(this).balance);
        } else {
            uint256 balance = IERC20(token).balanceOf(address(this));
            if (balance > 0) {
                IERC20(token).safeTransfer(to, balance);
            }
        }
    }

    // Allow contract to receive ETH
    receive() external payable {}
}

