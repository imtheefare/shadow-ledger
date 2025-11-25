# Shadow Ledger

A privacy-preserving ledger system built with Fully Homomorphic Encryption (FHE) using FHEVM. Shadow Ledger enables organizations to maintain encrypted financial records on-chain while allowing authorized parties to perform calculations and audits without decrypting sensitive data.

## Features

- **Encrypted Record Management**: Create and store income/expense records with encrypted amounts
- **Department Management**: Organize records by departments with role-based access control
- **Homomorphic Calculations**: Perform encrypted calculations (total income, expenses, net income) without decryption
- **Audit Trail**: Comprehensive audit capabilities for authorized auditors
- **Privacy-Preserving**: All financial amounts are encrypted using FHEVM

## Project Structure

```
.
├── fhevm-hardhat-template/    # Smart contracts and deployment
│   ├── contracts/             # Solidity contracts
│   ├── deploy/                # Deployment scripts
│   ├── test/                  # Contract tests
│   └── tasks/                 # Hardhat custom tasks
└── shadowledger-frontend/     # Next.js frontend application
    ├── app/                   # Next.js app router pages
    ├── components/            # React components
    ├── hooks/                 # Custom React hooks
    └── fhevm/                 # FHEVM integration utilities
```

## Prerequisites

- Node.js >= 20
- npm >= 7.0.0
- Hardhat node (for local development)
- MetaMask or compatible Web3 wallet

## Installation

### Smart Contracts

```bash
cd fhevm-hardhat-template
npm install
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
```

### Frontend

```bash
cd shadowledger-frontend
npm install
```

## Development

### Local Development (Mock Mode)

1. Start Hardhat node:
```bash
cd fhevm-hardhat-template
npx hardhat node
```

2. Deploy contracts:
```bash
npx hardhat deploy --network localhost
```

3. Start frontend with mock relayer:
```bash
cd shadowledger-frontend
npm run dev:mock
```

### Production Mode (Real Relayer)

```bash
cd shadowledger-frontend
npm run dev
```

## Testing

### Smart Contracts

```bash
cd fhevm-hardhat-template
npm run compile
npm run test
```

### Frontend

```bash
cd shadowledger-frontend
npm run build
npm run check:static
```

## Deployment

### Deploy to Sepolia Testnet

```bash
cd fhevm-hardhat-template
npx hardhat deploy --network sepolia
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## License

BSD-3-Clause-Clear

