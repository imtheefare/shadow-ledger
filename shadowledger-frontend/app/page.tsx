"use client";

import Link from "next/link";
import { useMetaMask } from "@/hooks/metamask/useMetaMaskProvider";

export default function Home() {
  const { isConnected, connect } = useMetaMask();

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        {/* Hero Section */}
        <div className="text-center space-y-6 mb-20">
          <div className="inline-block">
            <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold mb-4">
              <span className="gradient-text">ShadowLedger</span>
            </h1>
          </div>
          <p className="text-2xl sm:text-3xl font-semibold text-muted-foreground">
            Enterprise Privacy Ledger
          </p>
          <p className="text-lg sm:text-xl max-w-3xl mx-auto text-muted-foreground leading-relaxed">
            Secure, Encrypted Financial Management for Multi-Department Organizations
          </p>
          <div className="flex gap-4 justify-center pt-4">
            {isConnected ? (
              <Link
                href="/dashboard"
                className="btn-primary text-base"
              >
                Enter Dashboard →
              </Link>
            ) : (
              <button
                onClick={connect}
                className="btn-primary text-base"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          <div className="card card-hover">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-lg font-semibold mb-3">Encrypted Storage</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              All financial data is encrypted using FHEVM, ensuring complete privacy and security.
            </p>
          </div>

          <div className="card card-hover">
            <div className="text-4xl mb-4">🏢</div>
            <h3 className="text-lg font-semibold mb-3">Department Isolation</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Each department can only access its own data, maintaining strict data isolation.
            </p>
          </div>

          <div className="card card-hover">
            <div className="text-4xl mb-4">➕</div>
            <h3 className="text-lg font-semibold mb-3">Encrypted Calculation</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Perform cross-department calculations without decrypting the underlying data.
            </p>
          </div>

          <div className="card card-hover">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-lg font-semibold mb-3">Audit Compliance</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Authorized auditors can decrypt and review all financial records for compliance.
            </p>
          </div>
        </div>

        {/* Technology Section */}
        <div className="card">
          <h2 className="text-2xl font-semibold mb-4">Technology</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            ShadowLedger is built on <span className="font-semibold text-foreground">FHEVM (Fully Homomorphic Encryption Virtual Machine)</span>,
            enabling computations on encrypted data without revealing the underlying values.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
              Sepolia Testnet
            </span>
            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
              Local Hardhat Node
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

