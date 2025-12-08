"use client";

import { useMetaMaskEthersSigner } from "@/hooks/metamask/useMetaMaskEthersSigner";
import { useInMemoryStorage } from "@/hooks/useInMemoryStorage";
import { useFhevm } from "@/fhevm/useFhevm";
import { useShadowLedger } from "@/hooks/useShadowLedger";
import { ethers } from "ethers";
import { useState, useEffect } from "react";
import { ShadowLedgerAddresses } from "@/abi/ShadowLedgerAddresses";
import { ShadowLedgerABI } from "@/abi/ShadowLedgerABI";

export default function AuditPage() {
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

  const [isAuditor, setIsAuditor] = useState<boolean | undefined>(undefined);
  const [allRecords, setAllRecords] = useState<
    Array<{
      id: bigint;
      recordType: 0 | 1;
      amountHandle: string;
      amountDecrypted?: bigint;
      departmentId: bigint;
      projectId: bigint;
      description: string;
      timestamp: bigint;
      creator: string;
    }>
  >([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [decryptingRecordId, setDecryptingRecordId] = useState<bigint | undefined>(undefined);
  
  // Add auditor functionality
  const [newAuditorAddress, setNewAuditorAddress] = useState<string>("");
  const [isAddingAuditor, setIsAddingAuditor] = useState(false);
  const [addAuditorMessage, setAddAuditorMessage] = useState<string>("");

  const checkAuditorStatus = async () => {
    if (!shadowLedger.contractAddress || shadowLedger.contractAddress === ethers.ZeroAddress || !accounts?.[0] || !ethersReadonlyProvider) {
      setIsAuditor(false);
      return;
    }

    try {
      const contract = new ethers.Contract(
        shadowLedger.contractAddress,
        ShadowLedgerABI.abi,
        ethersReadonlyProvider
      );
      const auditor = await contract.isAuditor(accounts[0]);
      setIsAuditor(auditor);
    } catch (error) {
      console.error("Error checking auditor status:", error);
      setIsAuditor(false);
    }
  };

  const loadAllRecords = async () => {
    if (!shadowLedger.contractAddress || !ethersReadonlyProvider || !isAuditor) return;

    setIsLoadingAudit(true);
    try {
      const contract = new ethers.Contract(
        shadowLedger.contractAddress,
        ShadowLedgerABI.abi,
        ethersReadonlyProvider
      );

      const recordCount = await contract.getRecordCount();
      const recordsList = [];

      for (let i = BigInt(1); i <= recordCount; i++) {
        try {
          const recordData = await contract.getRecord(i);
          recordsList.push({
            id: BigInt(i),
            recordType: Number(recordData[1]) as 0 | 1,
            amountHandle: recordData[2],
            departmentId: BigInt(recordData[3]),
            projectId: BigInt(recordData[4]),
            description: recordData[5],
            timestamp: BigInt(recordData[6]),
            creator: recordData[7],
          });
        } catch {
          // Skip inaccessible records
        }
      }

      setAllRecords(recordsList);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to load records: ${errorMessage}`);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleDecryptRecord = async (recordId: bigint, handle: string) => {
    if (!fhevmInstance || !ethersSigner) return;

    setDecryptingRecordId(recordId);
    try {
      const decrypted = await shadowLedger.decryptAmount(handle);
      if (decrypted !== undefined) {
        setAllRecords((prev) =>
          prev.map((r) =>
            r.id === recordId
              ? { ...r, amountDecrypted: decrypted }
              : r
          )
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Decryption failed: ${errorMessage}`);
    } finally {
      setDecryptingRecordId(undefined);
    }
  };

  const handleAddAuditor = async () => {
    if (!shadowLedger.contractAddress || !ethersSigner || !newAuditorAddress.trim()) {
      setAddAuditorMessage("Please enter a valid address");
      return;
    }

    // Validate address format
    if (!ethers.isAddress(newAuditorAddress.trim())) {
      setAddAuditorMessage("Invalid address format");
      return;
    }

    setIsAddingAuditor(true);
    setAddAuditorMessage("");

    try {
      const contract = new ethers.Contract(
        shadowLedger.contractAddress,
        ShadowLedgerABI.abi,
        ethersSigner
      );

      const tx = await contract.addAuditor(newAuditorAddress.trim());
      setAddAuditorMessage(`Transaction submitted: ${tx.hash.slice(0, 10)}...`);
      
      await tx.wait();
      setAddAuditorMessage("Auditor added successfully!");
      setNewAuditorAddress("");
      
      // Refresh auditor status if the added address is the current user
      if (newAuditorAddress.trim().toLowerCase() === accounts?.[0]?.toLowerCase()) {
        await checkAuditorStatus();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("only system admin")) {
        setAddAuditorMessage("Error: Only system admin can add auditors");
      } else if (errorMessage.includes("already auditor")) {
        setAddAuditorMessage("Error: This address is already an auditor");
      } else if (errorMessage.includes("invalid auditor")) {
        setAddAuditorMessage("Error: Invalid auditor address");
      } else {
        setAddAuditorMessage(`Failed to add auditor: ${errorMessage}`);
      }
    } finally {
      setIsAddingAuditor(false);
    }
  };

  useEffect(() => {
    if (isConnected && accounts?.[0] && shadowLedger.contractAddress && shadowLedger.contractAddress !== ethers.ZeroAddress && ethersReadonlyProvider) {
      checkAuditorStatus();
    } else if (isConnected && (!accounts?.[0] || !shadowLedger.contractAddress || shadowLedger.contractAddress === ethers.ZeroAddress)) {
      // If connected but contract not deployed, set to false
      setIsAuditor(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, accounts, shadowLedger.contractAddress, ethersReadonlyProvider]);

  if (!isConnected) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-6">Audit</h1>
          <p className="text-muted-foreground mb-4">
            Please connect your wallet to access audit functions.
          </p>
          <button
            onClick={connect}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (!shadowLedger.isDeployed) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Audit</h1>
          <div className="bg-card border rounded-lg p-6">
            <p className="text-muted-foreground">
              ShadowLedger contract is not deployed on this network.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show loading only if we're connected and still checking
  if (isAuditor === undefined && isConnected && accounts?.[0] && shadowLedger.contractAddress && shadowLedger.contractAddress !== ethers.ZeroAddress) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Audit</h1>
          <div className="bg-card border rounded-lg p-6">
            <p className="text-muted-foreground">Checking auditor status...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold mb-2">
            <span className="gradient-text">Audit</span>
          </h1>
          <p className="text-muted-foreground">Audit and review all financial records</p>
        </div>

        {/* Add Auditor Section - Available to all users (system admin only can actually add) */}
        <div className="card card-hover mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>👤</span> Add Auditor
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            System administrators can add new auditors. Only authorized auditors can view and decrypt all records.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newAuditorAddress}
              onChange={(e) => setNewAuditorAddress(e.target.value)}
              placeholder="Enter auditor address (0x...)"
              className="input-field flex-1"
              disabled={isAddingAuditor}
            />
            <button
              onClick={handleAddAuditor}
              disabled={isAddingAuditor || !newAuditorAddress.trim() || !shadowLedger.contractAddress}
              className="btn-secondary"
            >
              {isAddingAuditor ? "⏳ Adding..." : "➕ Add Auditor"}
            </button>
          </div>
          {addAuditorMessage && (
            <p className={`text-sm mt-3 px-3 py-2 rounded-lg ${
              addAuditorMessage.includes("Error") 
                ? "bg-destructive/10 text-destructive border border-destructive/20" 
                : "bg-primary/5 text-muted-foreground border border-primary/20"
            }`}>
              {addAuditorMessage}
            </p>
          )}
        </div>

        {/* Auditor-only sections */}
        {!isAuditor ? (
          <div className="card">
            <div className="text-center py-8">
              <div className="text-5xl mb-4">🔒</div>
              <p className="text-muted-foreground mb-2">
                You are not authorized as an auditor.
              </p>
              <p className="text-sm text-muted-foreground">
                Only authorized auditors can view and decrypt all records.
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                If you are a system administrator, you can add yourself or others as auditors using the form above.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <span>📋</span> Audit Records
              </h2>
              <button
                onClick={loadAllRecords}
                disabled={isLoadingAudit}
                className="btn-primary"
              >
                {isLoadingAudit ? "⏳ Loading..." : "📥 Load All Records"}
              </button>
            </div>

            <div className="card">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <span>🔍</span> All Records (Audit View)
              </h2>
              {isLoadingAudit ? (
                <div className="text-center py-12">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-muted-foreground">Loading records...</p>
                </div>
              ) : allRecords.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">📝</div>
                  <p className="text-muted-foreground mb-4">No records loaded.</p>
                  <p className="text-sm text-muted-foreground">Click &quot;Load All Records&quot; to view.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allRecords.map((record) => (
                    <div
                      key={record.id.toString()}
                      className="card card-hover bg-muted/30"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              record.recordType === 0 
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            }`}>
                              {record.recordType === 0 ? "💰 Income" : "💸 Expense"}
                            </span>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                              #{record.id.toString()}
                            </span>
                          </div>
                          <p className="font-medium mb-2">{record.description}</p>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>Department: {record.departmentId.toString()} | Project: {record.projectId.toString()}</p>
                            <p>Creator: {record.creator.slice(0, 6)}...{record.creator.slice(-4)}</p>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          {record.amountDecrypted !== undefined ? (
                            <>
                              <p className={`text-2xl font-bold mb-1 ${
                                record.recordType === 0 
                                  ? "text-green-700 dark:text-green-400" 
                                  : "text-red-700 dark:text-red-400"
                              }`}>
                                {record.amountDecrypted.toString()}
                              </p>
                              <p className="text-xs text-muted-foreground bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full inline-block">
                                Decrypted
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-mono text-sm bg-muted/50 p-2 rounded mb-2">
                                {record.amountHandle.slice(0, 12)}...
                              </p>
                              <p className="text-xs text-muted-foreground mb-2">Encrypted</p>
                              <button
                                onClick={() => handleDecryptRecord(record.id, record.amountHandle)}
                                disabled={decryptingRecordId === record.id}
                                className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                              >
                                {decryptingRecordId === record.id ? "⏳ Decrypting..." : "🔓 Decrypt"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

