"use client";

import { useState } from "react";
import { useMetaMaskEthersSigner } from "@/hooks/metamask/useMetaMaskEthersSigner";
import { useInMemoryStorage } from "@/hooks/useInMemoryStorage";
import { useFhevm } from "@/fhevm/useFhevm";
import { useShadowLedger } from "@/hooks/useShadowLedger";

export default function LedgerPage() {
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
    status: fhevmStatus,
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

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    recordType: 0 as 0 | 1,
    amount: "",
    departmentId: "",
    projectId: "",
    description: "",
  });

  const handleCreateRecord = async () => {
    if (!formData.amount || !formData.departmentId || !formData.description) {
      alert("Please fill in all required fields");
      return;
    }

    if (shadowLedger.departments.length === 0) {
      alert("No departments available. Please create a department first.");
      return;
    }

    await shadowLedger.createRecord(
      formData.recordType,
      BigInt(formData.amount),
      BigInt(formData.departmentId),
      BigInt(formData.projectId || "0"),
      formData.description
    );

    setShowCreateForm(false);
    setFormData({
      recordType: 0,
      amount: "",
      departmentId: "",
      projectId: "",
      description: "",
    });
  };

  const handleDecrypt = async (record: typeof shadowLedger.records[0]) => {
    if (record.amountDecrypted !== undefined) return;

    const decrypted = await shadowLedger.decryptAmount(record.amountHandle);
    if (decrypted !== undefined) {
      const updatedRecords = shadowLedger.records.map((r) =>
        r.id === record.id ? { ...r, amountDecrypted: decrypted } : r
      );
      // Note: This is a simplified update. In production, you'd want to manage this state properly.
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              <span className="gradient-text">Ledger</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Please connect your wallet to view and manage records.
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
            <span className="gradient-text">Ledger</span>
          </h1>
          <div className="card">
            <p className="text-muted-foreground">
              ShadowLedger contract is not deployed on this network. Please deploy the contract first.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-4xl sm:text-5xl font-bold">
              <span className="gradient-text">Ledger</span>
            </h1>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className={`btn-primary ${showCreateForm ? "bg-secondary text-secondary-foreground hover:bg-secondary/80" : ""}`}
            >
              {showCreateForm ? "✕ Cancel" : "+ Add Record"}
            </button>
          </div>
          <p className="text-muted-foreground">Create and manage encrypted financial records</p>
        </div>

        {showCreateForm && (
          <div className="card card-hover mb-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <span>📝</span> Create New Record
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-2">Type</label>
                <select
                  value={formData.recordType}
                  onChange={(e) =>
                    setFormData({ ...formData, recordType: Number(e.target.value) as 0 | 1 })
                  }
                  className="input-field"
                >
                  <option value={0}>💰 Income</option>
                  <option value={1}>💸 Expense</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Amount</label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="input-field"
                  placeholder="Enter amount"
                />
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <span>🔒</span> Amount will be encrypted before storage
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Department</label>
                {shadowLedger.departments.length === 0 ? (
                  <div className="input-field bg-muted text-muted-foreground cursor-not-allowed">
                    No departments available. Please create a department first.
                  </div>
                ) : (
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Select a department</option>
                    {shadowLedger.departments.map((dept) => (
                      <option key={dept.id.toString()} value={dept.id.toString()}>
                        {dept.name} (ID: {dept.id.toString()})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Project ID <span className="text-muted-foreground font-normal">(optional)</span></label>
                <input
                  type="number"
                  value={formData.projectId}
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                  className="input-field"
                  placeholder="Enter project ID (0 for none)"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input-field"
                  placeholder="Enter description"
                />
              </div>
              <button
                onClick={handleCreateRecord}
                disabled={shadowLedger.isLoading}
                className="btn-primary w-full"
              >
                {shadowLedger.isLoading ? "⏳ Creating..." : "✨ Create Record"}
              </button>
            </div>
          </div>
        )}

        {shadowLedger.message && (
          <div className="card bg-primary/5 border-primary/20 mb-6">
            <p className="text-sm flex items-center gap-2">
              <span>ℹ️</span>
              {shadowLedger.message}
            </p>
          </div>
        )}

        <div className="card">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <span>📋</span> Records
          </h2>
          {shadowLedger.isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin text-3xl mb-2">⏳</div>
              <p className="text-muted-foreground">Loading records...</p>
            </div>
          ) : shadowLedger.records.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">📝</div>
              <p className="text-muted-foreground mb-4">No records found.</p>
              <p className="text-sm text-muted-foreground">Create your first record above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {shadowLedger.records.map((record) => (
                <div
                  key={record.id.toString()}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors card-hover"
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
                      <p className="font-medium mb-1">{record.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Dept: {record.departmentId.toString()} | Project: {record.projectId.toString()}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      {record.amountDecrypted !== undefined ? (
                        <div>
                          <p className={`text-xl font-bold ${
                            record.recordType === 0 
                              ? "text-green-700 dark:text-green-400" 
                              : "text-red-700 dark:text-red-400"
                          }`}>
                            {record.amountDecrypted.toString()}
                          </p>
                          <p className="text-xs text-muted-foreground bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full inline-block mt-1">
                            Decrypted
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-mono text-sm bg-muted/50 p-2 rounded mb-2">
                            {record.amountHandle.slice(0, 12)}...
                          </p>
                          <button
                            onClick={() => handleDecrypt(record)}
                            className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                          >
                            🔓 Decrypt
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

