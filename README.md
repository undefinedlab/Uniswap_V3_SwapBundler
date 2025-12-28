# Uniswap v3 Swap Bundler

A simple Node.js project for executing Uniswap v3 swaps on Sepolia testnet using Hardhat. Includes a custom swap router contract and a bundler for transaction one block execution.

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Sepolia ETH for gas fees

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with:
```
PRIVATE_KEY=your_private_key_here
SEPOLIA_RPC_URL=https://rpc.sepolia.org
ROUTER_ADDRESS=0x5D49f98ea31bfa7B41473Bc034BCA56B659C11A3
BUNDLER_ADDRESS=0xf0d5b956C7D9e541606Cc6d156ab258AFAeb314E

# Optional: Slippage protection (in basis points, 200 = 2%, 100 = 1%)
SLIPPAGE_BPS=200

# Optional: For private submissions 
USE_PRIVATE_RPC=false
PRIVATE_RPC_URL=https://rpc.private.io/sepolia
```

## Usage

### 1. Deploy Contracts

**Deploy Router:**
```bash
npm run deploy-router
# or
npx hardhat run scripts/deploy-router.js --network sepolia
```

**Deploy Bundler:**
```bash
npm run deploy-bundler
# or
npx hardhat run scripts/deploy-bundler.js --network sepolia
```

Update your `.env` file with the deployed addresses.

### 2. Execute Swaps

**Direct Swap (No Bundling):**
```bash
npm run swap
# or
npx hardhat run scripts/swap-with-custom-router.js --network sepolia
```

**Bundled Swap (Hidden Transaction):**
```bash
npm run swap-bundled
# or
npx hardhat run scripts/swap-with-bundler.js --network sepolia
```

## Bundler Features

The `SwapBundler` contract provides transaction privacy by:

1. **Hiding Your Address**: Transactions appear to come from the bundler contract, not your wallet
2. **Single Transaction Bundling**: Each swap can be submitted as a single bundle
3. **Batch Swaps**: Option to batch multiple swaps in one transaction

### How It Works

1. You send ETH to the bundler contract
2. The bundler wraps ETH to WETH
3. The bundler executes the swap through the router
4. Output tokens are sent directly to your address
5. The transaction appears to come from the bundler, not your wallet

### Privacy Levels

- **Basic Bundling**: Transaction goes through bundler (hides your address in the transaction)
- **Private RPC**: Use `USE_PRIVATE_RPC=true` with a private RPC endpoint (e.g., Flashbots) to avoid public mempool
- **Obfuscation**: Use `bundleSwapWithObfuscation` function to add dummy operations

## Contract Addresses (Sepolia)

### Custom Contracts (Deployed)
- **SimpleSwapRouter**: `0x5D49f98ea31bfa7B41473Bc034BCA56B659C11A3`
- **SwapBundler**: `0xf0d5b956C7D9e541606Cc6d156ab258AFAeb314E`

### Uniswap v3 Contracts
- **SwapRouter02**: `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`
- **Pool (WETH/USDC 0.05%)**: `0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1`

### Tokens
- **WETH**: `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`
- **USDC**: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`

## Contract Functions

### SimpleSwapRouter
- `exactInputSingleWithPool`: Swap tokens using a specific pool address
- `exactInputSingleWithETH`: Swap ETH (automatically wraps to WETH) for tokens

### SwapBundler
- `bundleSwap`: Execute a single swap through the bundler
- `bundleSwaps`: Execute multiple swaps in one transaction
- `bundleSwapWithObfuscation`: Execute swap with dummy operations for obfuscation

## Example Swaps

✅ Successfully swapped **0.001 ETH** → **4.49 USDC** (direct)
✅ Successfully swapped **0.002 ETH** → **8.98 USDC** (bundled)

## Notes

- The custom router handles ETH wrapping automatically
- The bundler adds a small gas overhead (~15-20k gas)
- Make sure you have sufficient balance of the input token (or ETH)
- The swap uses exact input (you specify input amount, output is variable)
- Always verify pool exists before attempting a swap


## Troubleshooting

- **Insufficient balance**: Make sure you have enough ETH or input token
- **Pool not found**: Verify the pool exists with the specified parameters
- **Gas errors**: Increase gas limit in the script if needed
- **Router not deployed**: Run the deploy script first
- **Bundler revert**: Check that router address is correct in bundler constructor
