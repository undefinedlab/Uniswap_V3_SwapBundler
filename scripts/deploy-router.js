const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("Deploying SimpleSwapRouter...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const SimpleSwapRouter = await ethers.getContractFactory("SimpleSwapRouter");
  const router = await SimpleSwapRouter.deploy();

  await router.waitForDeployment();
  const routerAddress = await router.getAddress();

  console.log("✓ SimpleSwapRouter deployed to:", routerAddress);
  console.log("\nYou can now use this router address in your swap scripts!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

