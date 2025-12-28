const { ethers } = require("hardhat");
require("dotenv").config();

// Router address (already deployed)
const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS;

async function main() {
  console.log("Deploying SwapBundler...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  if (!ROUTER_ADDRESS) {
    console.error("❌ ROUTER_ADDRESS not set!");
    console.error("   Please deploy the router first:");
    console.error("   npx hardhat run scripts/deploy-router.js --network sepolia");
    console.error("   Then set ROUTER_ADDRESS in your .env file");
    process.exit(1);
  }

  console.log("Router address:", ROUTER_ADDRESS);

  const SwapBundler = await ethers.getContractFactory("SwapBundler");
  const bundler = await SwapBundler.deploy(ROUTER_ADDRESS);

  await bundler.waitForDeployment();
  const bundlerAddress = await bundler.getAddress();

  console.log("\n✓ SwapBundler deployed to:", bundlerAddress);
  console.log("\nYou can now use this bundler address to hide your swaps!");
  console.log("Add to .env: BUNDLER_ADDRESS=" + bundlerAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

