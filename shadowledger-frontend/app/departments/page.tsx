"use client";

import { useState } from "react";
import { useMetaMaskEthersSigner } from "@/hooks/metamask/useMetaMaskEthersSigner";
import { useInMemoryStorage } from "@/hooks/useInMemoryStorage";
import { useFhevm } from "@/fhevm/useFhevm";
import { useShadowLedger } from "@/hooks/useShadowLedger";

export default function DepartmentsPage() {
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

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    admin: accounts?.[0] || "",
  });

  const handleCreateDepartment = async () => {
    if (!formData.name || !formData.admin) {
      alert("Please fill in all required fields");
      return;
    }

    await shadowLedger.createDepartment(formData.name, formData.admin);
    setShowCreateForm(false);
    setFormData({ name: "", admin: accounts?.[0] || "" });
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              <span className="gradient-text">Departments</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Please connect your wallet to manage departments.
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
            <span className="gradient-text">Departments</span>
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-4xl sm:text-5xl font-bold">
              <span className="gradient-text">Departments</span>
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => shadowLedger.refreshDepartments()}
                disabled={shadowLedger.isLoading}
                className="btn-secondary text-sm"
              >
                {shadowLedger.isLoading ? "⏳ Loading..." : "🔄 Refresh"}
              </button>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className={`btn-primary text-sm ${showCreateForm ? "bg-secondary text-secondary-foreground hover:bg-secondary/80" : ""}`}
              >
                {showCreateForm ? "✕ Cancel" : "+ Create Department"}
              </button>
            </div>
          </div>
          <p className="text-muted-foreground">Manage organizational departments</p>
        </div>

        {showCreateForm && (
          <div className="card card-hover mb-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <span>🏢</span> Create New Department
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-2">Department Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-field"
                  placeholder="Enter department name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Admin Address</label>
                <input
                  type="text"
                  value={formData.admin}
                  onChange={(e) => setFormData({ ...formData, admin: e.target.value })}
                  className="input-field font-mono"
                  placeholder="0x..."
                />
              </div>
              <button
                onClick={handleCreateDepartment}
                disabled={shadowLedger.isLoading}
                className="btn-primary w-full"
              >
                {shadowLedger.isLoading ? "⏳ Creating..." : "✨ Create Department"}
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
            <span>📋</span> Department List
          </h2>
          {shadowLedger.isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin text-3xl mb-2">⏳</div>
              <p className="text-muted-foreground">Loading departments...</p>
            </div>
          ) : shadowLedger.departments.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🏢</div>
              <p className="text-muted-foreground mb-4">No departments found.</p>
              <p className="text-sm text-muted-foreground">Create your first department above</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shadowLedger.departments.map((dept) => (
                <div
                  key={dept.id.toString()}
                  className="card card-hover bg-gradient-to-br from-muted/30 to-muted/10"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold">{dept.name}</h3>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      ID: {dept.id.toString()}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground">
                      <span className="font-medium">Admin:</span>{" "}
                      <span className="font-mono">{dept.admin.slice(0, 6)}...{dept.admin.slice(-4)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium">Members:</span> {dept.members.length}
                    </p>
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

