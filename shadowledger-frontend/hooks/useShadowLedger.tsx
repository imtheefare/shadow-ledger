"use client";

import { ethers } from "ethers";
import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { FhevmInstance, UserDecryptResults } from "@/fhevm/fhevmTypes";
import { FhevmDecryptionSignature } from "@/fhevm/FhevmDecryptionSignature";
import { GenericStringStorage } from "@/fhevm/GenericStringStorage";
import { ShadowLedgerAddresses } from "@/abi/ShadowLedgerAddresses";
import { ShadowLedgerABI } from "@/abi/ShadowLedgerABI";

type ShadowLedgerInfoType = {
  abi: typeof ShadowLedgerABI.abi;
  address?: `0x${string}`;
  chainId?: number;
  chainName?: string;
};

function getShadowLedgerByChainId(
  chainId: number | undefined
): ShadowLedgerInfoType {
  if (!chainId) {
    return { abi: ShadowLedgerABI.abi };
  }

  const entry =
    ShadowLedgerAddresses[chainId.toString() as keyof typeof ShadowLedgerAddresses];

  if (!("address" in entry) || entry.address === ethers.ZeroAddress) {
    return { abi: ShadowLedgerABI.abi, chainId };
  }

  return {
    address: entry?.address as `0x${string}` | undefined,
    chainId: entry?.chainId ?? chainId,
    chainName: entry?.chainName,
    abi: ShadowLedgerABI.abi,
  };
}

export type RecordType = 0 | 1; // 0 = Income, 1 = Expense

export type Record = {
  id: bigint;
  recordType: RecordType;
  amountHandle: string;
  amountDecrypted?: bigint;
  departmentId: bigint;
  projectId: bigint;
  description: string;
  timestamp: bigint;
  creator: string;
};

export type Department = {
  id: bigint;
  name: string;
  members: string[];
  admin: string;
  createdAt: bigint;
};

export const useShadowLedger = (parameters: {
  instance: FhevmInstance | undefined;
  fhevmDecryptionSignatureStorage: GenericStringStorage;
  eip1193Provider: ethers.Eip1193Provider | undefined;
  chainId: number | undefined;
  ethersSigner: ethers.JsonRpcSigner | undefined;
  ethersReadonlyProvider: ethers.ContractRunner | undefined;
  sameChain: RefObject<(chainId: number | undefined) => boolean>;
  sameSigner: RefObject<
    (ethersSigner: ethers.JsonRpcSigner | undefined) => boolean
  >;
}) => {
  const {
    instance,
    fhevmDecryptionSignatureStorage,
    chainId,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
  } = parameters;

  const [records, setRecords] = useState<Record[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");

  const shadowLedgerRef = useRef<ShadowLedgerInfoType | undefined>(undefined);
  const isLoadingRef = useRef<boolean>(false);
  const isLoadingRecordsRef = useRef<boolean>(false);
  const isLoadingDepartmentsRef = useRef<boolean>(false);

  const shadowLedger = useMemo(() => {
    const c = getShadowLedgerByChainId(chainId);
    shadowLedgerRef.current = c;

    if (chainId !== undefined && !c.address) {
      setMessage(`ShadowLedger deployment not found for chainId=${chainId}.`);
    } else if (chainId === undefined) {
      // Clear message when chainId is not yet loaded
      setMessage("");
    }

    return c;
  }, [chainId]);

  const isDeployed = useMemo(() => {
    if (!shadowLedger) {
      return undefined;
    }
    return Boolean(shadowLedger.address) && shadowLedger.address !== ethers.ZeroAddress;
  }, [shadowLedger]);

  const canInteract = useMemo(() => {
    return Boolean(shadowLedger.address) && shadowLedger.address !== ethers.ZeroAddress && Boolean(ethersReadonlyProvider);
  }, [shadowLedger.address, ethersReadonlyProvider]);

  const createRecord = useCallback(
    async (
      recordType: RecordType,
      amount: bigint,
      departmentId: bigint,
      projectId: bigint,
      description: string
    ) => {
      if (isLoadingRef.current || !shadowLedger.address || !instance || !ethersSigner) {
        return;
      }

      const thisChainId = chainId;
      const thisShadowLedgerAddress = shadowLedger.address;
      const thisEthersSigner = ethersSigner;

      isLoadingRef.current = true;
      setIsLoading(true);
      setMessage("Encrypting amount...");

      const run = async () => {
        const isStale = () =>
          thisShadowLedgerAddress !== shadowLedgerRef.current?.address ||
          !sameChain.current(thisChainId) ||
          !sameSigner.current(thisEthersSigner);

        try {
          const input = instance.createEncryptedInput(
            thisShadowLedgerAddress,
            thisEthersSigner.address
          );
          input.add128(Number(amount));

          const enc = await input.encrypt();

          if (isStale()) {
            setMessage("Operation cancelled");
            return;
          }

          setMessage("Submitting transaction...");

          const contract = new ethers.Contract(
            thisShadowLedgerAddress,
            shadowLedger.abi,
            thisEthersSigner
          );

          const tx: ethers.TransactionResponse = await contract.createRecord(
            recordType,
            enc.handles[0],
            enc.inputProof,
            departmentId,
            projectId,
            description
          );

          setMessage(`Waiting for tx: ${tx.hash}...`);

          const receipt = await tx.wait();

          setMessage(`Record created! Status: ${receipt?.status}`);

          if (isStale()) {
            setMessage("Operation cancelled");
            return;
          }

          // Reset loading state before refreshing
          isLoadingRef.current = false;
          setIsLoading(false);
          
          // Refresh records list (skip loading check since we just reset it)
          await refreshRecords(true);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          setMessage(`Failed to create record: ${errorMessage}`);
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      };

      run();
    },
    [
      ethersSigner,
      shadowLedger.address,
      shadowLedger.abi,
      instance,
      chainId,
      sameChain,
      sameSigner,
    ]
  );

  const refreshRecords = useCallback(async (skipLoadingCheck = false) => {
    const currentAddress = shadowLedgerRef.current?.address;
    if (!currentAddress || !ethersReadonlyProvider) {
      return;
    }
    
    // Don't start a new refresh if one is already in progress (unless explicitly skipped)
    if (!skipLoadingCheck && isLoadingRecordsRef.current) {
      console.log('[useShadowLedger] refreshRecords: already loading, skipping');
      return;
    }
    
    console.log('[useShadowLedger] refreshRecords: starting refresh');

    const thisChainId = chainId;
    const thisShadowLedgerAddress = currentAddress;
    const currentShadowLedger = shadowLedgerRef.current;
    
    // Double check after async check
    if (!currentShadowLedger || thisShadowLedgerAddress !== currentShadowLedger.address) {
      return;
    }
    
    const thisAbi = currentShadowLedger.abi;

    isLoadingRecordsRef.current = true;
    // Update global loading state if not already loading
    if (!isLoadingDepartmentsRef.current) {
      isLoadingRef.current = true;
      setIsLoading(true);
    }

    try {
      const contract = new ethers.Contract(
        thisShadowLedgerAddress,
        thisAbi,
        ethersReadonlyProvider
      );

      const recordCount = await contract.getRecordCount();

      const recordsList: Record[] = [];
      for (let i = BigInt(1); i <= recordCount; i++) {
        try {
          const recordData = await contract.getRecord(i);
          recordsList.push({
            id: BigInt(i),
            recordType: Number(recordData[1]) as RecordType,
            amountHandle: recordData[2],
            departmentId: BigInt(recordData[3]),
            projectId: BigInt(recordData[4]),
            description: recordData[5],
            timestamp: BigInt(recordData[6]),
            creator: recordData[7],
          });
        } catch {
          // Skip records we can't access
        }
      }

      if (sameChain.current(thisChainId) && thisShadowLedgerAddress === shadowLedgerRef.current?.address) {
        setRecords(recordsList);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(`Failed to refresh records: ${errorMessage}`);
    } finally {
      isLoadingRecordsRef.current = false;
      // Update global loading state only if departments are also not loading
      if (!isLoadingDepartmentsRef.current) {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [ethersReadonlyProvider, chainId, sameChain]);

  const decryptAmount = useCallback(
    async (handle: string) => {
      if (!shadowLedger.address || !instance || !ethersSigner || !handle) {
        return;
      }

      if (handle === ethers.ZeroHash) {
        return BigInt(0);
      }

      const thisChainId = chainId;
      const thisShadowLedgerAddress = shadowLedger.address;
      const thisHandle = handle;
      const thisEthersSigner = ethersSigner;

      setMessage("Decrypting amount...");

      const run = async () => {
        const isStale = () =>
          thisShadowLedgerAddress !== shadowLedgerRef.current?.address ||
          !sameChain.current(thisChainId) ||
          !sameSigner.current(thisEthersSigner);

        try {
          // Always create a new signature, don't use cache
          const { publicKey, privateKey } = instance.generateKeypair();
          const sig: FhevmDecryptionSignature | null =
            await FhevmDecryptionSignature.new(
              instance,
              [thisShadowLedgerAddress],
              publicKey,
              privateKey,
              thisEthersSigner
            );

          if (!sig) {
            setMessage("Unable to build FHEVM decryption signature");
            return;
          }

          if (isStale()) {
            setMessage("Operation cancelled");
            return;
          }

          const res = await instance.userDecrypt(
            [{ handle: thisHandle, contractAddress: thisShadowLedgerAddress }],
            sig.privateKey,
            sig.publicKey,
            sig.signature,
            sig.contractAddresses,
            sig.userAddress,
            sig.startTimestamp,
            sig.durationDays
          );

          if (isStale()) {
            setMessage("Operation cancelled");
            return;
          }

          const result = (res as UserDecryptResults)[thisHandle];
          if (typeof result === "bigint") {
            return result;
          }
          return undefined;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          setMessage(`Decryption failed: ${errorMessage}`);
          return undefined;
        }
      };

      return run();
    },
    [
      ethersSigner,
      shadowLedger.address,
      instance,
      chainId,
      sameChain,
      sameSigner,
    ]
  );

  const createDepartment = useCallback(
    async (name: string, admin: string) => {
      if (isLoadingRef.current || !shadowLedger.address || !ethersSigner) {
        return;
      }

      const thisChainId = chainId;
      const thisShadowLedgerAddress = shadowLedger.address;
      const thisEthersSigner = ethersSigner;

      isLoadingRef.current = true;
      setIsLoading(true);
      setMessage("Creating department...");

      const run = async () => {
        const isStale = () =>
          thisShadowLedgerAddress !== shadowLedgerRef.current?.address ||
          !sameChain.current(thisChainId) ||
          !sameSigner.current(thisEthersSigner);

        try {
          const contract = new ethers.Contract(
            thisShadowLedgerAddress,
            shadowLedger.abi,
            thisEthersSigner
          );

          const tx: ethers.TransactionResponse = await contract.createDepartment(
            name,
            admin
          );

          setMessage(`Waiting for tx: ${tx.hash}...`);

          const receipt = await tx.wait();

          setMessage(`Department created! Status: ${receipt?.status}`);

          if (isStale()) {
            setMessage("Operation cancelled");
            return;
          }

          // Reset loading state before refreshing
          isLoadingRef.current = false;
          setIsLoading(false);
          
          // Refresh departments list (skip loading check since we just reset it)
          await refreshDepartments(true);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          setMessage(`Failed to create department: ${errorMessage}`);
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      };

      run();
    },
    [
      ethersSigner,
      shadowLedger.address,
      shadowLedger.abi,
      chainId,
      sameChain,
      sameSigner,
    ]
  );

  const refreshDepartments = useCallback(async (skipLoadingCheck = false) => {
    const currentAddress = shadowLedgerRef.current?.address;
    if (!currentAddress || !ethersReadonlyProvider) {
      console.log('[useShadowLedger] refreshDepartments: missing address or provider', { currentAddress, hasProvider: !!ethersReadonlyProvider });
      return;
    }
    
    // Don't start a new refresh if one is already in progress (unless explicitly skipped)
    if (!skipLoadingCheck && isLoadingDepartmentsRef.current) {
      console.log('[useShadowLedger] refreshDepartments: already loading, skipping');
      return;
    }
    
    console.log('[useShadowLedger] refreshDepartments: starting refresh');

    const thisChainId = chainId;
    const thisShadowLedgerAddress = currentAddress;
    const currentShadowLedger = shadowLedgerRef.current;
    
    // Double check after async check
    if (!currentShadowLedger || thisShadowLedgerAddress !== currentShadowLedger.address) {
      return;
    }
    
    const thisAbi = currentShadowLedger.abi;

    isLoadingDepartmentsRef.current = true;
    // Update global loading state if not already loading
    if (!isLoadingRecordsRef.current) {
      isLoadingRef.current = true;
      setIsLoading(true);
    }

    try {
      const contract = new ethers.Contract(
        thisShadowLedgerAddress,
        thisAbi,
        ethersReadonlyProvider
      );

      const departmentCount = await contract.getDepartmentCount();

      const departmentsList: Department[] = [];
      for (let i = BigInt(1); i <= departmentCount; i++) {
        try {
          const deptData = await contract.getDepartment(i);
          departmentsList.push({
            id: BigInt(i),
            name: deptData[1],
            members: deptData[2],
            admin: deptData[3],
            createdAt: BigInt(deptData[4]),
          });
        } catch {
          // Skip departments we can't access
        }
      }

      if (sameChain.current(thisChainId) && thisShadowLedgerAddress === shadowLedgerRef.current?.address) {
        setDepartments(departmentsList);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(`Failed to refresh departments: ${errorMessage}`);
    } finally {
      isLoadingDepartmentsRef.current = false;
      // Update global loading state only if records are also not loading
      if (!isLoadingRecordsRef.current) {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [ethersReadonlyProvider, chainId, sameChain]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const hasLoadedRef = useRef<string | undefined>(undefined);
  const lastChainIdRef = useRef<number | undefined>(undefined);

  // Initialize refs on mount
  useEffect(() => {
    isLoadingRef.current = false;
    isLoadingRecordsRef.current = false;
    isLoadingDepartmentsRef.current = false;
    hasLoadedRef.current = undefined;
    lastChainIdRef.current = undefined;
  }, []);

  useEffect(() => {
    const currentShadowLedger = shadowLedgerRef.current;
    const currentAddress = currentShadowLedger?.address;
    const currentChainId = chainId;
    
    // Reset if chainId changed
    if (currentChainId !== undefined && currentChainId !== lastChainIdRef.current) {
      hasLoadedRef.current = undefined;
      lastChainIdRef.current = currentChainId;
    }
    
    // Only proceed if we have all required data
    if (!currentAddress || currentChainId === undefined || !ethersReadonlyProvider) {
      return;
    }
    
    // Check if we should load (canInteract is true, not currently loading, and haven't loaded this address yet)
    const shouldLoad = canInteract && 
                       !isLoadingRecordsRef.current && 
                       !isLoadingDepartmentsRef.current &&
                       hasLoadedRef.current !== currentAddress;
    
    if (shouldLoad) {
      console.log('[useShadowLedger] Auto-loading data for address:', currentAddress, 'chainId:', currentChainId);
      hasLoadedRef.current = currentAddress;
      // Call both in parallel, skip loading check for initial load
      refreshRecords(true);
      refreshDepartments(true);
    } else {
      console.log('[useShadowLedger] Not loading:', {
        canInteract,
        isLoading: isLoadingRef.current,
        hasLoaded: hasLoadedRef.current,
        currentAddress,
        shouldLoad
      });
    }
    
    // Reset flag when canInteract becomes false
    if (!canInteract && hasLoadedRef.current) {
      hasLoadedRef.current = undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canInteract, shadowLedger.address, chainId, ethersReadonlyProvider]);

  return {
    contractAddress: shadowLedger.address,
    isDeployed,
    canInteract,
    isLoading,
    message,
    records,
    departments,
    createRecord,
    refreshRecords,
    decryptAmount,
    createDepartment,
    refreshDepartments,
  };
};

