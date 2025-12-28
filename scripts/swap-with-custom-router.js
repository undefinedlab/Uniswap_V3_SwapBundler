const { ethers } = require("hardhat");
require("dotenv").config();

// Uniswap v3 Pool and Token Addresses
const POOL_ADDRESS = process.env.POOL_ADDRESS;
const WETH_ADDRESS = process.env.WETH_ADDRESS;
const USDC_ADDRESS = process.env.USDC_ADDRESS;
const POOL_FEE = parseInt(process.env.POOL_FEE || "500"); // Default 0.05%

// Router address
const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS;

async function main() {
  console.log("Starting Uniswap v3 ETH -> USDC Swap with Custom Router...\n");

  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  const balance = await ethers.provider.getBalance(signer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  if (!POOL_ADDRESS || !WETH_ADDRESS || !USDC_ADDRESS || !ROUTER_ADDRESS) {
    console.error("❌ Missing required environment variables!");
    console.error("   Please set the following in your .env file:");
    console.error("   - POOL_ADDRESS");
    console.error("   - WETH_ADDRESS");
    console.error("   - USDC_ADDRESS");
    console.error("   - ROUTER_ADDRESS");
    console.error("\n   To deploy router:");
    console.error("   npx hardhat run scripts/deploy-router.js --network sepolia");
    process.exit(1);
  }

  // Amount to swap
  const amountIn = ethers.parseEther("0.002");
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

  console.log("Swap Parameters:");
  console.log("  Router:", ROUTER_ADDRESS);
  console.log("  Pool:", POOL_ADDRESS);
  console.log("  Amount In:", ethers.formatEther(amountIn), "ETH");
  console.log("  Token In (WETH):", WETH_ADDRESS);
  console.log("  Token Out (USDC):", USDC_ADDRESS);
  console.log("  Fee:", POOL_FEE);
  console.log("");

  // Check balance
  if (balance < amountIn + ethers.parseEther("0.001")) {
    console.error("❌ Insufficient ETH balance for swap and gas!");
    return;
  }

  // Get router contract
  const router = await ethers.getContractAt("SimpleSwapRouter", ROUTER_ADDRESS, signer);

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
    // Prepare swap parameters
    const params = {
      tokenIn: WETH_ADDRESS,
      tokenOut: USDC_ADDRESS,
      fee: POOL_FEE,
      recipient: signer.address,
      deadline: deadline,
      amountIn: amountIn,
      amountOutMinimum: 0, // Accept any amount (you can set a minimum for slippage protection)
      sqrtPriceLimitX96: 0, // No price limit
    };

    console.log("Executing swap...");
    console.log("  This will:");
    console.log("    1. Wrap ETH to WETH");
    console.log("    2. Swap WETH for USDC using the pool");
    console.log("");

    // Execute swap with ETH (wraps automatically)
    const tx = await router.exactInputSingleWithETH(
      POOL_ADDRESS,
      WETH_ADDRESS,
      params,
      { value: amountIn, gasLimit: 500000 }
    );

    console.log("  Transaction hash:", tx.hash);
    console.log("  Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("  ✓ Swap confirmed in block:", receipt.blockNumber);
    console.log("  Gas used:", receipt.gasUsed.toString());

    // Check output balance
    const balanceAfter = await usdc.balanceOf(signer.address);
    const received = balanceAfter - balanceBefore;

    console.log(`\n✓ Swap completed!`);
    console.log(`  Received: ${ethers.formatUnits(received, usdcDecimals)} ${usdcSymbol}`);
    console.log(`  Total USDC Balance: ${ethers.formatUnits(balanceAfter, usdcDecimals)} ${usdcSymbol}`);
    
    const finalEthBalance = await ethers.provider.getBalance(signer.address);
    console.log(`  Remaining ETH: ${ethers.formatEther(finalEthBalance)} ETH`);

  } catch (error) {
    console.error("❌ Swap failed:", error.message);
    
    if (error.data) {
      console.error("Error data:", error.data);
    }
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
    
    // Try to decode revert reason if available
    if (error.transaction) {
      console.error("\nTrying to decode revert reason...");
      try {
        await ethers.provider.call(error.transaction);
      } catch (callError) {
        if (callError.data) {
          console.error("Revert data:", callError.data);
        }
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

