// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IUniswapV3Pool {
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
    
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
    function transfer(address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/**
 * @title SimpleSwapRouter
 * @notice A simple Uniswap v3 swap router that handles exact input single swaps
 * @dev This router directly interacts with Uniswap v3 pools
 */
contract SimpleSwapRouter {
    using SafeERC20 for IERC20;

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @dev The callback function called by the pool during a swap
    /// @param amount0Delta The amount of token0 that was sent (negative) or must be received (positive)
    /// @param amount1Delta The amount of token1 that was sent (negative) or must be received (positive)
    /// @param data Encoded data passed from the swap function
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external {
        require(amount0Delta > 0 || amount1Delta > 0, "Invalid callback");
        
        // Decode the data to get token and payer info
        (address tokenIn, address payer) = abi.decode(data, (address, address));
        
        // Determine which token we need to pay
        address tokenToPay = amount0Delta > 0 
            ? IUniswapV3Pool(msg.sender).token0()
            : IUniswapV3Pool(msg.sender).token1();
        
        require(tokenToPay == tokenIn, "Token mismatch");
        
        // Calculate the amount to pay
        uint256 amountToPay = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);
        
        // Transfer the tokens from the payer to the pool
        if (payer == address(this)) {
            // If payer is this contract, use transfer (tokens are already here)
            IERC20(tokenIn).safeTransfer(msg.sender, amountToPay);
        } else {
            // Otherwise, transfer from the payer
            IERC20(tokenIn).safeTransferFrom(payer, msg.sender, amountToPay);
        }
    }

    /**
     * @notice Swaps an exact amount of input tokens for as many output tokens as possible
     * @param params The parameters for the swap
     * @return amountOut The amount of output tokens received
     */
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        require(block.timestamp <= params.deadline, "Transaction too old");
        
        // Get the pool address (we'll need to compute it or pass it)
        // For now, we'll need to pass the pool address or compute it
        // This is a simplified version - in production you'd use PoolAddress.computeAddress
        
        // This function is not implemented - use exactInputSingleWithPool instead
        revert("Pool address needed - use exactInputSingleWithPool");
    }

    /**
     * @notice Swaps an exact amount of input tokens using a specific pool address
     * @param pool The address of the Uniswap v3 pool
     * @param params The parameters for the swap
     * @return amountOut The amount of output tokens received
     */
    function exactInputSingleWithPool(
        address pool,
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut) {
        require(block.timestamp <= params.deadline, "Transaction too old");
        
        // Transfer input tokens to this contract
        IERC20(params.tokenIn).safeTransferFrom(
            msg.sender,
            address(this),
            params.amountIn
        );
        
        // Determine swap direction
        bool zeroForOne = params.tokenIn < params.tokenOut;
        
        // Prepare callback data
        bytes memory callbackData = abi.encode(params.tokenIn, address(this));
        
        // Perform the swap
        (int256 amount0, int256 amount1) = IUniswapV3Pool(pool).swap(
            params.recipient,
            zeroForOne,
            int256(params.amountIn),
            params.sqrtPriceLimitX96 == 0
                ? (zeroForOne ? 4295128739 + 1 : 1461446703485210103287273052203988822378723970342 - 1)
                : params.sqrtPriceLimitX96,
            callbackData
        );
        
        // Calculate output amount
        amountOut = uint256(-(zeroForOne ? amount1 : amount0));
        
        require(amountOut >= params.amountOutMinimum, "Too little received");
    }

    /**
     * @notice Wraps ETH to WETH and performs a swap
     * @param pool The address of the Uniswap v3 pool
     * @param weth The WETH contract address
     * @param params The parameters for the swap (tokenIn should be WETH address, amountIn is ignored - uses msg.value)
     * @return amountOut The amount of output tokens received
     */
    function exactInputSingleWithETH(
        address pool,
        address weth,
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut) {
        require(params.tokenIn == weth, "tokenIn must be WETH");
        require(msg.value > 0, "Must send ETH");
        
        // Wrap ETH to WETH
        IWETH(weth).deposit{value: msg.value}();
        
        // Update params with actual amount
        ExactInputSingleParams memory updatedParams = params;
        updatedParams.amountIn = msg.value;
        updatedParams.tokenIn = weth;
        
        // Perform swap using internal logic
        amountOut = _swapExactInputSingle(pool, updatedParams);
    }

    /**
     * @dev Internal function to perform the swap
     */
    function _swapExactInputSingle(
        address pool,
        ExactInputSingleParams memory params
    ) internal returns (uint256 amountOut) {
        require(block.timestamp <= params.deadline, "Transaction too old");
        
        // Determine swap direction
        bool zeroForOne = params.tokenIn < params.tokenOut;
        
        // Prepare callback data
        bytes memory callbackData = abi.encode(params.tokenIn, address(this));
        
        // Perform the swap
        (int256 amount0, int256 amount1) = IUniswapV3Pool(pool).swap(
            params.recipient,
            zeroForOne,
            int256(params.amountIn),
            params.sqrtPriceLimitX96 == 0
                ? (zeroForOne ? 4295128739 + 1 : 1461446703485210103287273052203988822378723970342 - 1)
                : params.sqrtPriceLimitX96,
            callbackData
        );
        
        // Calculate output amount
        amountOut = uint256(-(zeroForOne ? amount1 : amount0));
        
        require(amountOut >= params.amountOutMinimum, "Too little received");
    }
}

