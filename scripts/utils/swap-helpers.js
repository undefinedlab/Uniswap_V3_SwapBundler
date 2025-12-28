const { ethers } = require("ethers");

// Private RPC endpoints (free alternatives)
const PRIVATE_RPC_ENDPOINTS = {
  // FlashTrades (free, supports multiple networks)
  // Note: Sepolia support may be limited, will fallback gracefully
  flashtrades: {
    sepolia: null, // Not available, will use original RPC
    mainnet: "https://rpc.flashbots.net", // Use Flashbots for mainnet
  },
  // Flashbots Protect (mainnet only, free)
  flashbots: {
    mainnet: "https://rpc.flashbots.net",
  },
  // Eden Network (mainnet only)
  eden: {
    mainnet: "https://api.edennetwork.io/v1/rpc",
  },
};

/**
 * Get a quote for a swap by simulating it on the pool
 */
async function getSwapQuote(pool, tokenIn, tokenOut, amountIn, fee, provider) {
  try {
    // Try to use QuoterV2 if available
    const QUOTER_V2 = process.env.QUOTER_V2_ADDRESS;
    
    const quoterABI = [
      "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
    ];
    
    if (QUOTER_V2) {
      try {
        const quoter = new ethers.Contract(QUOTER_V2, quoterABI, provider);
        const amountOut = await quoter.quoteExactInputSingle.staticCall(
          tokenIn,
          tokenOut,
          fee,
          amountIn,
          0
        );
        return amountOut;
      } catch (e) {
        // Quoter not available, calculate from pool state
        return await getQuoteFromPool(pool, tokenIn, tokenOut, amountIn, provider);
      }
    } else {
      // Quoter not configured, calculate from pool state
      return await getQuoteFromPool(pool, tokenIn, tokenOut, amountIn, provider);
    }
  } catch (error) {
    console.warn("  ⚠️  Could not get quote, using 0 as minimum");
    return null;
  }
}

/**
 * Calculate quote from pool state (fallback method)
 */
async function getQuoteFromPool(poolAddress, tokenIn, tokenOut, amountIn, provider) {
  try {
    const poolABI = [
      "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
      "function liquidity() external view returns (uint128)",
      "function token0() external view returns (address)",
      "function token1() external view returns (address)",
    ];
    
    const pool = new ethers.Contract(poolAddress, poolABI, provider);
    const slot0 = await pool.slot0();
    const token0 = await pool.token0();
    
    // Simple price calculation (approximate)
    // This is a simplified version - in production use proper Uniswap math
    const price = (Number(slot0.sqrtPriceX96) / 2**96) ** 2;
    
    // Determine swap direction
    const zeroForOne = token0.toLowerCase() === tokenIn.toLowerCase();
    
    // Approximate output (this is simplified - real calculation is more complex)
    const amountOut = zeroForOne 
      ? BigInt(Math.floor(Number(amountIn) * price))
      : BigInt(Math.floor(Number(amountIn) / price));
    
    return amountOut;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate minimum output with slippage tolerance
 * @param {bigint} expectedOutput - Expected output amount
 * @param {number} slippageBps - Slippage in basis points (100 = 1%)
 * @returns {bigint} Minimum output amount
 */
function calculateMinOutput(expectedOutput, slippageBps = 100) {
  if (!expectedOutput || expectedOutput === 0n) {
    return 0n;
  }
  
  // Calculate 99% (or custom slippage) of expected output
  const slippageMultiplier = 10000n - BigInt(slippageBps);
  const minOutput = (expectedOutput * slippageMultiplier) / 10000n;
  
  return minOutput;
}

/**
 * Check if network is production (mainnet)
 */
function isProductionNetwork(chainId) {
  // Ethereum mainnet
  return chainId === 1n || chainId === 1;
}

/**
 * Check if RPC is private/protected
 */
function isPrivateRPC(rpcUrl) {
  if (!rpcUrl) return false;
  
  const url = rpcUrl.toLowerCase();
  
  // Check for known private RPC endpoints
  return (
    url.includes("flashbots") ||
    url.includes("flashtrades") ||
    url.includes("eden") ||
    url.includes("bloxroute") ||
    url.includes("private") ||
    url.includes("protect")
  );
}

/**
 * Get private RPC URL for network
 */
function getPrivateRPCUrl(network) {
  const networkName = network.toLowerCase();
  
  // Try FlashTrades first (free, supports testnets)
  if (PRIVATE_RPC_ENDPOINTS.flashtrades[networkName]) {
    return PRIVATE_RPC_ENDPOINTS.flashtrades[networkName];
  }
  
  // Try Flashbots for mainnet
  if (networkName === "mainnet" && PRIVATE_RPC_ENDPOINTS.flashbots.mainnet) {
    return PRIVATE_RPC_ENDPOINTS.flashbots.mainnet;
  }
  
  // Try Eden for mainnet
  if (networkName === "mainnet" && PRIVATE_RPC_ENDPOINTS.eden.mainnet) {
    return PRIVATE_RPC_ENDPOINTS.eden.mainnet;
  }
  
  return null;
}

/**
 * Enforce private RPC for production networks and auto-use for Sepolia
 */
async function enforcePrivateRPC(provider, network, rpcUrl) {
  const chainId = await provider.getNetwork().then(n => n.chainId);
  const isProduction = isProductionNetwork(chainId);
  const networkName = network.toLowerCase();
  
  // For Sepolia, note that private RPC is preferred but not always available
  // We'll still use the bundler and slippage protection for MEV mitigation
  if (networkName === "sepolia" && !isPrivateRPC(rpcUrl)) {
    console.log("  ℹ️  Sepolia: Using bundler + slippage protection for MEV mitigation");
    console.log("     (Private RPC not available for Sepolia, but bundler provides protection)");
    return false; // Use original RPC but with protection
  }
  
  if (isProduction) {
    const isPrivate = isPrivateRPC(rpcUrl);
    
    if (!isPrivate) {
      const privateRPC = getPrivateRPCUrl(network);
      
      if (privateRPC) {
        console.error("\n❌ PRODUCTION NETWORK DETECTED!");
        console.error("   Private RPC is REQUIRED for production networks.");
        console.error(`   Current RPC: ${rpcUrl}`);
        console.error(`   Recommended: ${privateRPC}`);
        console.error("\n   Set in .env:");
        console.error(`   ETH_RPC_URL=${privateRPC}`);
        console.error("   (or use PRIVATE_RPC_URL for FlashTrades/Flashbots)\n");
        throw new Error("Private RPC required for production network");
      } else {
        console.warn("\n⚠️  PRODUCTION NETWORK DETECTED!");
        console.warn("   Private RPC is recommended but not configured.");
        console.warn("   Your transactions will be visible in public mempool.");
        console.warn("   Consider using FlashTrades, Flashbots Protect, or Eden Network.\n");
      }
    } else {
      console.log("  ✓ Using private RPC for production network");
      return true;
    }
  }
  
  return isPrivateRPC(rpcUrl);
}

/**
 * Create a private RPC provider
 */
function createPrivateProvider(network, customRPC = null) {
  const privateRPC = customRPC || getPrivateRPCUrl(network);
  
  if (!privateRPC) {
    return null;
  }
  
  return new ethers.JsonRpcProvider(privateRPC);
}

module.exports = {
  getSwapQuote,
  calculateMinOutput,
  isProductionNetwork,
  isPrivateRPC,
  getPrivateRPCUrl,
  enforcePrivateRPC,
  createPrivateProvider,
  PRIVATE_RPC_ENDPOINTS,
};

