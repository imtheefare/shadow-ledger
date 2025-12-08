"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useMetaMaskEthersSigner } from "@/hooks/metamask/useMetaMaskEthersSigner";
import { useInMemoryStorage } from "@/hooks/useInMemoryStorage";
import { useFhevm } from "@/fhevm/useFhevm";
import { useShadowLedger } from "@/hooks/useShadowLedger";
import { ShadowLedgerAddresses } from "@/abi/ShadowLedgerAddresses";
import { ShadowLedgerABI } from "@/abi/ShadowLedgerABI";

export default function CalculationsPage() {
  const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();
  const {
    provider,
    chainId,
    accounts,
    isConnected,
    connect,
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

  const [calculationType, setCalculationType] = useState<"income" | "expense" | "net">("income");
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [resultHandle, setResultHandle] = useState<string | undefined>(undefined);
  const [resultDecrypted, setResultDecrypted] = useState<bigint | undefined>(undefined);
  const [isCalculating, setIsCalculating] = useState(false);
  const [message, setMessage] = useState<string>("");

  const handleDepartmentToggle = (departmentId: string) => {
    setSelectedDepartmentIds((prev) =>
      prev.includes(departmentId)
        ? prev.filter((id) => id !== departmentId)
        : [...prev, departmentId]
    );
  };

  const handleCalculate = async () => {
    if (!shadowLedger.contractAddress || !ethersSigner) return;

    if (selectedDepartmentIds.length === 0) {
      alert("Please select at least one department");
      return;
    }

    const deptIds = selectedDepartmentIds.map((id) => BigInt(id));

    setIsCalculating(true);
    setResultHandle(undefined);
    setResultDecrypted(undefined);

    try {
      const contract = new ethers.Contract(
        shadowLedger.contractAddress,
        ShadowLedgerABI.abi,
        ethersSigner
      );

      setMessage("Submitting calculation transaction...");

      let txResponse: unknown;
      if (calculationType === "income") {
        txResponse = await contract.calculateTotalIncome(
          deptIds,
          BigInt(projectId || "0")
        );
      } else if (calculationType === "expense") {
        txResponse = await contract.calculateTotalExpense(
          deptIds,
          BigInt(projectId || "0")
        );
      } else {
        txResponse = await contract.calculateNetIncome(
          deptIds,
          BigInt(projectId || "0")
        );
      }

      // Check if the result is a transaction response or a direct handle
      let result: string;
      if (txResponse && typeof txResponse === "object" && "hash" in txResponse) {
        // It's a transaction response, wait for it and get the return value
        const tx = txResponse as ethers.TransactionResponse;
        setMessage(`Waiting for transaction: ${tx.hash}...`);
        const receipt = await tx.wait();
        
        if (!receipt) {
          throw new Error("Transaction receipt not found");
        }

        // In ethers v6, for functions with return values, we need to call the function
        // again as a static call to get the return value, or decode it from the transaction
        // For FHEVM functions returning euint128, the handle is the return value
        // We'll need to call it again after the transaction is confirmed
        setMessage("Transaction confirmed. Getting result handle...");
        
        // Call the function again as a static call to get the return value
        // Note: This works because the state has been updated by the previous transaction
        const staticResult = await contract[calculationType === "income" ? "calculateTotalIncome" : calculationType === "expense" ? "calculateTotalExpense" : "calculateNetIncome"].staticCall(
          deptIds,
          BigInt(projectId || "0")
        );
        
        result = staticResult as string;
      } else {
        // Direct return value (handle)
        result = txResponse as string;
      }

      // In FHEVM, functions returning euint128 return the handle directly as a string (bytes32)
      // The result should be a hex string representing the handle
      if (typeof result !== "string") {
        throw new Error(`Unexpected result type: ${typeof result}. Expected string (handle).`);
      }

      setResultHandle(result);
      setMessage("Calculation completed successfully!");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(`Calculation failed: ${errorMessage}`);
      alert(`Calculation failed: ${errorMessage}`);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleDecryptResult = async () => {
    if (!resultHandle || !fhevmInstance || !ethersSigner) return;

    const decrypted = await shadowLedger.decryptAmount(resultHandle);
    if (decrypted !== undefined) {
      setResultDecrypted(decrypted);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              <span className="gradient-text">Calculations</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Please connect your wallet to perform calculations.
            </p>
            <button
              onClick={connect}
              className="btn-primary"
            >
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!shadowLedger.isDeployed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">
            <span className="gradient-text">Calculations</span>
          </h1>
          <div className="card">
            <p className="text-muted-foreground">
              ShadowLedger contract is not deployed on this network.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold mb-2">
            <span className="gradient-text">Cross-Department Calculations</span>
          </h1>
          <p className="text-muted-foreground">Perform encrypted calculations across departments</p>
        </div>

        {message && (
          <div className="card bg-primary/5 border-primary/20 mb-6">
            <p className="text-sm flex items-center gap-2">
              <span>ℹ️</span>
              {message}
            </p>
          </div>
        )}

        <div className="card card-hover mb-6">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <span>🧮</span> Calculation Parameters
          </h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-2">Calculation Type</label>
              <select
                value={calculationType}
                onChange={(e) => setCalculationType(e.target.value as "income" | "expense" | "net")}
                className="input-field"
              >
                <option value="income">💰 Total Income</option>
                <option value="expense">💸 Total Expense</option>
                <option value="net">📊 Net Income</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">
                Select Departments
              </label>
              {shadowLedger.departments.length === 0 ? (
                <div className="input-field bg-muted text-muted-foreground cursor-not-allowed">
                  No departments available. Please create a department first.
                </div>
              ) : (
                <div className="input-field p-3 max-h-48 overflow-y-auto space-y-2">
                  {shadowLedger.departments.map((dept) => (
                    <label
                      key={dept.id.toString()}
                      className="flex items-center space-x-3 py-2 px-3 cursor-pointer hover:bg-muted/50 rounded-lg transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDepartmentIds.includes(dept.id.toString())}
                        onChange={() => handleDepartmentToggle(dept.id.toString())}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">
                        {dept.name} <span className="text-muted-foreground">(ID: {dept.id.toString()})</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {selectedDepartmentIds.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2 bg-muted/50 px-2 py-1 rounded inline-block">
                  Selected: {selectedDepartmentIds.length} department(s)
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Project ID <span className="text-muted-foreground font-normal">(0 for all)</span></label>
              <input
                type="number"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="input-field"
                placeholder="0"
              />
            </div>
            <button
              onClick={handleCalculate}
              disabled={isCalculating}
              className="btn-primary w-full"
            >
              {isCalculating ? "⏳ Calculating..." : "🧮 Calculate"}
            </button>
          </div>
        </div>

        {resultHandle && (
          <div className="card card-hover bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span>📊</span> Result
            </h2>
            <div className="space-y-3">
              {resultDecrypted !== undefined ? (
                <div>
                  <p className="text-4xl font-bold mb-2">{resultDecrypted.toString()}</p>
                  <p className="text-xs text-muted-foreground bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full inline-block">
                    Decrypted
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-mono text-sm break-all bg-muted/50 p-3 rounded mb-3">{resultHandle}</p>
                  <p className="text-sm text-muted-foreground mb-3">Encrypted (handle)</p>
                  <button
                    onClick={handleDecryptResult}
                    className="btn-primary text-sm"
                  >
                    🔓 Decrypt
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

