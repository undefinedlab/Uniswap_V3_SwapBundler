const { ethers } = require("hardhat");
require("dotenv").config();
const {
  getSwapQuote,
  calculateMinOutput,
  enforcePrivateRPC,
  createPrivateProvider,
  isPrivateRPC,
} = require("./utils/swap-helpers");

// Uniswap v3 Pool and Token Addresses
const POOL_ADDRESS = process.env.POOL_ADDRESS;
const WETH_ADDRESS = process.env.WETH_ADDRESS;
const USDC_ADDRESS = process.env.USDC_ADDRESS;
const POOL_FEE = parseInt(process.env.POOL_FEE || "500"); // Default 0.05%

// Router and Bundler addresses
const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS;
const BUNDLER_ADDRESS = process.env.BUNDLER_ADDRESS;

// Private RPC options
const USE_PRIVATE_RPC = process.env.USE_PRIVATE_RPC === "true";
const PRIVATE_RPC_URL = process.env.PRIVATE_RPC_URL || "";
const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "200"); // Default 2% (200 bps)

async function main() {
  console.log("Starting Bundled Swap (Hidden Transaction)...\n");

  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  const balance = await ethers.provider.getBalance(signer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  if (!POOL_ADDRESS || !WETH_ADDRESS || !USDC_ADDRESS || !ROUTER_ADDRESS || !BUNDLER_ADDRESS) {
    console.error("❌ Missing required environment variables!");
    console.error("   Please set the following in your .env file:");
    console.error("   - POOL_ADDRESS");
    console.error("   - WETH_ADDRESS");
    console.error("   - USDC_ADDRESS");
    console.error("   - ROUTER_ADDRESS");
    console.error("   - BUNDLER_ADDRESS");
    console.error("\n   To deploy contracts:");
    console.error("   npx hardhat run scripts/deploy-router.js --network sepolia");
    console.error("   npx hardhat run scripts/deploy-bundler.js --network sepolia");
    process.exit(1);
  }

  // Amount to swap
  const amountIn = ethers.parseEther("0.002");
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

  // Check RPC provider and enforce private RPC for production
  const hre = require("hardhat");
  let rpcUrl = process.env.SEPOLIA_RPC_URL || process.env.ETH_RPC_URL || "";
  const network = hre.network.name;
  
  let isPrivate = false;
  let privateRPCUrl = null;
  try {
    const result = await enforcePrivateRPC(signer.provider, network, rpcUrl);
    // Result can be boolean or RPC URL string
    if (typeof result === "string") {
      privateRPCUrl = result;
      isPrivate = true;
      rpcUrl = result; // Use the private RPC
    } else {
      isPrivate = result;
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  
  // Check if explicitly configured private RPC
  isPrivate = isPrivate || isPrivateRPC(rpcUrl) || (USE_PRIVATE_RPC && PRIVATE_RPC_URL);
  const isAlchemy = rpcUrl.includes("alchemy.com");
  
  console.log("Bundled Swap Parameters:");
  console.log("  Bundler:", BUNDLER_ADDRESS);
  console.log("  Router:", ROUTER_ADDRESS);
  console.log("  Pool:", POOL_ADDRESS);
  console.log("  Amount In:", ethers.formatEther(amountIn), "ETH");
  console.log("  Token In (WETH):", WETH_ADDRESS);
  console.log("  Token Out (USDC):", USDC_ADDRESS);
  console.log("  Network:", network);
  console.log("  RPC Provider:", isAlchemy ? "Alchemy" : (isPrivate ? "Private" : "Other"));
  if (isAlchemy && !isPrivate) {
    console.log("  ⚠️  Alchemy RPC does NOT provide privacy");
    console.log("     Transactions still go to public mempool");
  }
  if (isPrivate) {
    console.log("  ✓ Using private RPC (protected from MEV)");
  } else {
    console.log("  ℹ️  Using bundler + slippage protection (MEV mitigation)");
  }
  console.log("  Slippage Tolerance:", (SLIPPAGE_BPS / 100).toFixed(2), "%");
  console.log("");

  // Check balance
  if (balance < amountIn + ethers.parseEther("0.001")) {
    console.error("❌ Insufficient ETH balance for swap and gas!");
    return;
  }

  // Get bundler contract
  const bundler = await ethers.getContractAt("SwapBundler", BUNDLER_ADDRESS, signer);

  // Get USDC contract to check balance
  const usdc = new ethers.Contract(USDC_ADDRESS, [
    "function balanceOf(address) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ], signer);

  const usdcSymbol = await usdc.symbol();
  const usdcDecimals = await usdc.decimals();
  const balanceBefore = await usdc.balanceOf(signer.address);

  console.log(`USDC Balance Before: ${ethers.formatUnits(balanceBefore, usdcDecimals)} ${usdcSymbol}\n`);

  try {
    // Get quote for slippage calculation
    console.log("Getting swap quote...");
    const expectedOutput = await getSwapQuote(
      POOL_ADDRESS,
      WETH_ADDRESS,
      USDC_ADDRESS,
      amountIn,
      POOL_FEE,
      signer.provider
    );
    
    let minAmountOut = 0n;
    if (expectedOutput && expectedOutput > 0n) {
      minAmountOut = calculateMinOutput(expectedOutput, SLIPPAGE_BPS);
      console.log(`  Expected Output: ${ethers.formatUnits(expectedOutput, usdcDecimals)} ${usdcSymbol}`);
      console.log(`  Minimum Output (${(SLIPPAGE_BPS / 100).toFixed(2)}% slippage): ${ethers.formatUnits(minAmountOut, usdcDecimals)} ${usdcSymbol}`);
    } else {
      console.log("  ⚠️  Could not get quote, using 0 as minimum (no slippage protection)");
    }
    console.log("");

    // Prepare swap parameters
    const params = {
      tokenIn: WETH_ADDRESS,
      tokenOut: USDC_ADDRESS,
      fee: POOL_FEE,
      recipient: signer.address,
      deadline: deadline,
      amountIn: amountIn,
      amountOutMinimum: minAmountOut,
      sqrtPriceLimitX96: 0,
    };

    console.log("Executing bundled swap...");
    console.log("  This will:");
    console.log("    1. Send transaction through bundler (hides your address)");
    console.log("    2. Bundler wraps ETH to WETH");
    console.log("    3. Bundler executes swap");
    console.log("    4. Output tokens sent to you");
    console.log("");

    // Prepare transaction
    const txOptions = {
      value: amountIn,
      gasLimit: 600000, // Slightly higher for bundler overhead
    };

    // Use private RPC if configured, otherwise use standard RPC with bundler protection
    let tx;
    const finalPrivateRPC = privateRPCUrl || PRIVATE_RPC_URL;
    
    if (finalPrivateRPC && isPrivateRPC(finalPrivateRPC)) {
      console.log("  🔒 Using private RPC for transaction submission...");
      console.log(`  RPC: ${finalPrivateRPC.substring(0, 60)}...`);
      
      try {
        const privateProvider = new ethers.JsonRpcProvider(finalPrivateRPC);
        // Get private key from environment
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
          throw new Error("Private key not found. Set PRIVATE_KEY in .env");
        }
        const privateSigner = new ethers.Wallet(privateKey, privateProvider);
        const privateBundler = await ethers.getContractAt("SwapBundler", BUNDLER_ADDRESS, privateSigner);
        
        tx = await privateBundler.bundleSwap(
          POOL_ADDRESS,
          WETH_ADDRESS,
          params,
          txOptions
        );
      } catch (rpcError) {
        console.log("  ⚠️  Private RPC failed, falling back to standard RPC");
        console.log(`  Error: ${rpcError.message}`);
        // Fallback to standard RPC
        tx = await bundler.bundleSwap(
          POOL_ADDRESS,
          WETH_ADDRESS,
          params,
          txOptions
        );
      }
    } else {
      // Standard transaction with bundler + slippage protection
      console.log("  ℹ️  Using standard RPC with bundler + slippage protection");
      console.log("     (Bundler hides address, slippage protects from MEV)");
      tx = await bundler.bundleSwap(
        POOL_ADDRESS,
        WETH_ADDRESS,
        params,
        txOptions
      );
    }

    console.log("  Transaction hash:", tx.hash);
    console.log("  Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("  ✓ Bundled swap confirmed in block:", receipt.blockNumber);
    console.log("  Gas used:", receipt.gasUsed.toString());

    // Check output balance
    const balanceAfter = await usdc.balanceOf(signer.address);
    const received = balanceAfter - balanceBefore;

    console.log(`\n✓ Bundled swap completed!`);
    console.log(`  Received: ${ethers.formatUnits(received, usdcDecimals)} ${usdcSymbol}`);
    console.log(`  Total USDC Balance: ${ethers.formatUnits(balanceAfter, usdcDecimals)} ${usdcSymbol}`);
    
    const finalEthBalance = await ethers.provider.getBalance(signer.address);
    console.log(`  Remaining ETH: ${ethers.formatEther(finalEthBalance)} ETH`);

    // Check if event was emitted
    const events = receipt.logs.filter(log => {
      try {
        const parsed = bundler.interface.parseLog(log);
        return parsed && parsed.name === "SwapBundled";
      } catch {
        return false;
      }
    });

    if (events.length > 0) {
      const event = bundler.interface.parseLog(events[0]);
      console.log(`  Bundle ID: ${event.args.bundleId}`);
    }

  } catch (error) {
    console.error("❌ Bundled swap failed:", error.message);
    
    if (error.data) {
      console.error("Error data:", error.data);
    }
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

