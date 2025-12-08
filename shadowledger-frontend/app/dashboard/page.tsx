"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useMetaMask } from "@/hooks/metamask/useMetaMaskProvider";
import { useMetaMaskEthersSigner } from "@/hooks/metamask/useMetaMaskEthersSigner";
import { useInMemoryStorage } from "@/hooks/useInMemoryStorage";
import { useFhevm } from "@/fhevm/useFhevm";
import { useShadowLedger } from "@/hooks/useShadowLedger";
import { ShadowLedgerABI } from "@/abi/ShadowLedgerABI";

export default function DashboardPage() {
  const { isConnected, accounts, chainId, connect } = useMetaMask();
  const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();
  const {
    provider,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
    initialMockChains,
  } = useMetaMaskEthersSigner();

  const {
    instance: fhevmInstance,
  } = useFhevm({
    provider,
    chainId,
    initialMockChains,
    enabled: isConnected,
  });

  const shadowLedger = useShadowLedger({
    instance: fhevmInstance,
    fhevmDecryptionSignatureStorage,
    eip1193Provider: provider,
    chainId,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
  });

  const [totalIncomeHandle, setTotalIncomeHandle] = useState<string | undefined>(undefined);
  const [totalExpenseHandle, setTotalExpenseHandle] = useState<string | undefined>(undefined);
  const [netIncomeHandle, setNetIncomeHandle] = useState<string | undefined>(undefined);
  const [totalIncomeDecrypted, setTotalIncomeDecrypted] = useState<bigint | undefined>(undefined);
  const [totalExpenseDecrypted, setTotalExpenseDecrypted] = useState<bigint | undefined>(undefined);
  const [netIncomeDecrypted, setNetIncomeDecrypted] = useState<bigint | undefined>(undefined);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationMessage, setCalculationMessage] = useState<string>("");

  const calculateTotal = async (type: "income" | "expense" | "net") => {
    if (!shadowLedger.contractAddress || !ethersSigner || shadowLedger.departments.length === 0) {
      setCalculationMessage("No departments available for calculation");
      return;
    }

    setIsCalculating(true);
    setCalculationMessage(`Calculating total ${type}...`);

    try {
      const contract = new ethers.Contract(
        shadowLedger.contractAddress,
        ShadowLedgerABI.abi,
        ethersSigner
      );

      // Get all department IDs
      const allDeptIds = shadowLedger.departments.map((dept) => dept.id);

      let txResponse: unknown;
      if (type === "income") {
        txResponse = await contract.calculateTotalIncome(
          allDeptIds,
          BigInt(0) // 0 means all projects
        );
      } else if (type === "expense") {
        txResponse = await contract.calculateTotalExpense(
          allDeptIds,
          BigInt(0)
        );
      } else {
        txResponse = await contract.calculateNetIncome(
          allDeptIds,
          BigInt(0)
        );
      }

      // Check if the result is a transaction response or a direct handle
      let result: string;
      if (txResponse && typeof txResponse === "object" && "hash" in txResponse) {
        // It's a transaction response, wait for it and get the return value
        const tx = txResponse as ethers.TransactionResponse;
        setCalculationMessage(`Waiting for transaction: ${tx.hash.slice(0, 10)}...`);
        const receipt = await tx.wait();
        
        if (!receipt) {
          throw new Error("Transaction receipt not found");
        }

        // Call the function again as a static call to get the return value
        setCalculationMessage("Getting result handle...");
        const staticResult = await contract[type === "income" ? "calculateTotalIncome" : type === "expense" ? "calculateTotalExpense" : "calculateNetIncome"].staticCall(
          allDeptIds,
          BigInt(0)
        );
        
        result = staticResult as string;
      } else {
        // Direct return value (handle)
        result = txResponse as string;
      }

      if (typeof result !== "string") {
        throw new Error(`Unexpected result type: ${typeof result}. Expected string (handle).`);
      }

      if (type === "income") {
        setTotalIncomeHandle(result);
      } else if (type === "expense") {
        setTotalExpenseHandle(result);
      } else {
        setNetIncomeHandle(result);
      }

      setCalculationMessage(`Total ${type} calculated successfully!`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setCalculationMessage(`Calculation failed: ${errorMessage}`);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleDecryptTotal = async (type: "income" | "expense" | "net") => {
    if (!fhevmInstance || !ethersSigner) return;

    let handle: string | undefined;
    if (type === "income") {
      handle = totalIncomeHandle;
    } else if (type === "expense") {
      handle = totalExpenseHandle;
    } else {
      handle = netIncomeHandle;
    }

    if (!handle) return;

    const decrypted = await shadowLedger.decryptAmount(handle);
    if (decrypted !== undefined) {
      if (type === "income") {
        setTotalIncomeDecrypted(decrypted);
      } else if (type === "expense") {
        setTotalExpenseDecrypted(decrypted);
      } else {
        setNetIncomeDecrypted(decrypted);
      }
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold mb-2">
            <span className="gradient-text">Dashboard</span>
          </h1>
          <p className="text-muted-foreground">Overview of your financial data</p>
        </div>
        
        {!isConnected ? (
          <div className="card text-center py-12">
            <div className="text-5xl mb-4">🔐</div>
            <p className="text-lg text-muted-foreground mb-6">
              Please connect your wallet to view the dashboard.
            </p>
            <button
              onClick={connect}
              className="btn-primary"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="card">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span>👛</span> Wallet Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground mb-1">Address</p>
                  <p className="font-mono text-sm font-semibold">
                    {accounts?.[0] ? `${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}` : "N/A"}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground mb-1">Chain ID</p>
                  <p className="font-semibold">{chainId ?? "N/A"}</p>
                </div>
              </div>
            </div>

            {calculationMessage && (
              <div className="card bg-primary/5 border-primary/20">
                <p className="text-sm text-foreground flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  {calculationMessage}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card card-hover bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/20 dark:to-green-900/10 border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span>💰</span> Total Income
                  </h3>
                </div>
                {totalIncomeDecrypted !== undefined ? (
                  <>
                    <p className="text-4xl font-bold text-green-700 dark:text-green-400 mb-2">
                      {totalIncomeDecrypted.toString()}
                    </p>
                    <p className="text-xs text-muted-foreground bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full inline-block">
                      Decrypted
                    </p>
                  </>
                ) : totalIncomeHandle ? (
                  <>
                    <p className="font-mono text-sm break-all mb-3 bg-muted/50 p-2 rounded">
                      {totalIncomeHandle.slice(0, 12)}...
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDecryptTotal("income")}
                        className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        Decrypt
                      </button>
                      <button
                        onClick={() => calculateTotal("income")}
                        disabled={isCalculating}
                        className="text-xs px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                      >
                        Recalculate
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-bold text-muted-foreground mb-3">--</p>
                    <button
                      onClick={() => calculateTotal("income")}
                      disabled={isCalculating || shadowLedger.departments.length === 0}
                      className="btn-secondary text-sm w-full"
                    >
                      Calculate
                    </button>
                  </>
                )}
              </div>
              <div className="card card-hover bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-900/10 border-red-200 dark:border-red-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span>💸</span> Total Expense
                  </h3>
                </div>
                {totalExpenseDecrypted !== undefined ? (
                  <>
                    <p className="text-4xl font-bold text-red-700 dark:text-red-400 mb-2">
                      {totalExpenseDecrypted.toString()}
                    </p>
                    <p className="text-xs text-muted-foreground bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-full inline-block">
                      Decrypted
                    </p>
                  </>
                ) : totalExpenseHandle ? (
                  <>
                    <p className="font-mono text-sm break-all mb-3 bg-muted/50 p-2 rounded">
                      {totalExpenseHandle.slice(0, 12)}...
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDecryptTotal("expense")}
                        className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        Decrypt
                      </button>
                      <button
                        onClick={() => calculateTotal("expense")}
                        disabled={isCalculating}
                        className="text-xs px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                      >
                        Recalculate
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-bold text-muted-foreground mb-3">--</p>
                    <button
                      onClick={() => calculateTotal("expense")}
                      disabled={isCalculating || shadowLedger.departments.length === 0}
                      className="btn-secondary text-sm w-full"
                    >
                      Calculate
                    </button>
                  </>
                )}
              </div>
              <div className="card card-hover bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10 border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span>📊</span> Net Income
                  </h3>
                </div>
                {netIncomeDecrypted !== undefined ? (
                  <>
                    <p className={`text-4xl font-bold mb-2 ${
                      Number(netIncomeDecrypted) >= 0 
                        ? "text-green-700 dark:text-green-400" 
                        : "text-red-700 dark:text-red-400"
                    }`}>
                      {netIncomeDecrypted.toString()}
                    </p>
                    <p className="text-xs text-muted-foreground bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full inline-block">
                      Decrypted
                    </p>
                  </>
                ) : netIncomeHandle ? (
                  <>
                    <p className="font-mono text-sm break-all mb-3 bg-muted/50 p-2 rounded">
                      {netIncomeHandle.slice(0, 12)}...
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDecryptTotal("net")}
                        className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        Decrypt
                      </button>
                      <button
                        onClick={() => calculateTotal("net")}
                        disabled={isCalculating}
                        className="text-xs px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                      >
                        Recalculate
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-bold text-muted-foreground mb-3">--</p>
                    <button
                      onClick={() => calculateTotal("net")}
                      disabled={isCalculating || shadowLedger.departments.length === 0}
                      className="btn-secondary text-sm w-full"
                    >
                      Calculate
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="card">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span>📋</span> Recent Records
              </h2>
              {shadowLedger.isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-muted-foreground">Loading records...</p>
                </div>
              ) : shadowLedger.records.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">📝</div>
                  <p className="text-muted-foreground mb-4">No records yet.</p>
                  <Link
                    href="/ledger"
                    className="btn-primary text-sm"
                  >
                    Create Your First Record
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {shadowLedger.records.slice(0, 5).map((record) => (
                    <div 
                      key={record.id.toString()} 
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              record.recordType === 0 
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            }`}>
                              {record.recordType === 0 ? "Income" : "Expense"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              #{record.id.toString()}
                            </span>
                          </div>
                          <p className="text-sm font-medium">{record.description}</p>
                        </div>
                        <div className="text-right ml-4">
                          <p className="font-semibold">
                            {record.amountDecrypted !== undefined
                              ? record.amountDecrypted.toString()
                              : `${record.amountHandle.slice(0, 8)}...`}
                          </p>
                          {record.amountDecrypted === undefined && (
                            <p className="text-xs text-muted-foreground">Encrypted</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

