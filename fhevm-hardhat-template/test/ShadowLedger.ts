import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { ShadowLedger, ShadowLedger__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("ShadowLedger")) as ShadowLedger__factory;
  const shadowLedgerContract = (await factory.deploy()) as ShadowLedger;
  const shadowLedgerContractAddress = await shadowLedgerContract.getAddress();

  return { shadowLedgerContract, shadowLedgerContractAddress };
}

describe("ShadowLedger", function () {
  let signers: Signers;
  let shadowLedgerContract: ShadowLedger;
  let shadowLedgerContractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = {
      deployer: ethSigners[0],
      alice: ethSigners[1],
      bob: ethSigners[2],
      charlie: ethSigners[3],
    };
  });

  beforeEach(async function () {
    // Check whether the tests are running against an FHEVM mock environment
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ shadowLedgerContract, shadowLedgerContractAddress } = await deployFixture());
  });

  describe("Department Management", function () {
    it("should create a department", async function () {
      const tx = await shadowLedgerContract
        .connect(signers.deployer)
        .createDepartment("Engineering", signers.alice.address);
      await tx.wait();

      const department = await shadowLedgerContract.getDepartment(2); // ID 1 is System department
      expect(department[0]).to.eq(2); // id
      expect(department[1]).to.eq("Engineering"); // name
      expect(department[3]).to.eq(signers.alice.address); // admin
    });

    it("should add member to department", async function () {
      // Create department first
      let tx = await shadowLedgerContract
        .connect(signers.deployer)
        .createDepartment("Engineering", signers.alice.address);
      await tx.wait();

      // Add member
      tx = await shadowLedgerContract
        .connect(signers.alice)
        .addDepartmentMember(2, signers.bob.address);
      await tx.wait();

      const department = await shadowLedgerContract.getDepartment(2);
      expect(department[2]).to.include(signers.bob.address); // members array
    });

    it("should remove member from department", async function () {
      // Create department and add member
      let tx = await shadowLedgerContract
        .connect(signers.deployer)
        .createDepartment("Engineering", signers.alice.address);
      await tx.wait();

      tx = await shadowLedgerContract
        .connect(signers.alice)
        .addDepartmentMember(2, signers.bob.address);
      await tx.wait();

      // Remove member
      tx = await shadowLedgerContract
        .connect(signers.alice)
        .removeDepartmentMember(2, signers.bob.address);
      await tx.wait();

      const department = await shadowLedgerContract.getDepartment(2);
      expect(department[2]).to.not.include(signers.bob.address);
    });

    it("should get user departments", async function () {
      // Create department with alice as admin
      let tx = await shadowLedgerContract
        .connect(signers.deployer)
        .createDepartment("Engineering", signers.alice.address);
      await tx.wait();

      const userDepartments = await shadowLedgerContract.getUserDepartments(signers.alice.address);
      expect(userDepartments).to.include(2n);
    });
  });

  describe("Record Management", function () {
    let departmentId: bigint;

    beforeEach(async function () {
      // Create a department for testing
      const tx = await shadowLedgerContract
        .connect(signers.deployer)
        .createDepartment("Engineering", signers.alice.address);
      const receipt = await tx.wait();
      // Department ID should be 2 (1 is System department)
      departmentId = 2n;
      
      // Verify department was created correctly
      const dept = await shadowLedgerContract.getDepartment(departmentId);
      expect(dept[3]).to.eq(signers.alice.address); // admin should be alice
    });

    it("should create an income record", async function () {
      const clearAmount = 1000;
      const encryptedAmount = await fhevm
        .createEncryptedInput(shadowLedgerContractAddress, signers.alice.address)
        .add128(clearAmount)
        .encrypt();

      const tx = await shadowLedgerContract
        .connect(signers.alice)
        .createRecord(
          0, // RecordType.Income
          encryptedAmount.handles[0],
          encryptedAmount.inputProof,
          departmentId,
          0, // no project
          "Test income"
        );
      const receipt = await tx.wait();
      
      // Verify record was created by checking record count
      const recordCount = await shadowLedgerContract.getRecordCount();
      expect(recordCount).to.eq(1n);
      
      // Get department records to verify
      const records = await shadowLedgerContract.getDepartmentRecords(departmentId, 0, 10);
      expect(records.length).to.eq(1);
      expect(records[0]).to.eq(1n);
    });

    it("should create an expense record", async function () {
      const clearAmount = 500;
      const encryptedAmount = await fhevm
        .createEncryptedInput(shadowLedgerContractAddress, signers.alice.address)
        .add128(clearAmount)
        .encrypt();

      const tx = await shadowLedgerContract
        .connect(signers.alice)
        .createRecord(
          1, // RecordType.Expense
          encryptedAmount.handles[0],
          encryptedAmount.inputProof,
          departmentId,
          0,
          "Test expense"
        );
      await tx.wait();

      const recordCount = await shadowLedgerContract.getRecordCount();
      const record = await shadowLedgerContract.getRecord(recordCount);
      expect(record[1]).to.eq(1); // RecordType.Expense
    });

    it("should get department records", async function () {
      // Create multiple records
      const clearAmount1 = 1000;
      const encryptedAmount1 = await fhevm
        .createEncryptedInput(shadowLedgerContractAddress, signers.alice.address)
        .add128(clearAmount1)
        .encrypt();

      let tx = await shadowLedgerContract
        .connect(signers.alice)
        .createRecord(0, encryptedAmount1.handles[0], encryptedAmount1.inputProof, departmentId, 0, "Income 1");
      await tx.wait();

      const clearAmount2 = 2000;
      const encryptedAmount2 = await fhevm
        .createEncryptedInput(shadowLedgerContractAddress, signers.alice.address)
        .add128(clearAmount2)
        .encrypt();

      tx = await shadowLedgerContract
        .connect(signers.alice)
        .createRecord(0, encryptedAmount2.handles[0], encryptedAmount2.inputProof, departmentId, 0, "Income 2");
      await tx.wait();

      const records = await shadowLedgerContract.getDepartmentRecords(departmentId, 0, 10);
      expect(records.length).to.eq(2);
      // Records should be the last two created
      const recordCount = await shadowLedgerContract.getRecordCount();
      expect(records[0]).to.eq(recordCount - 1n);
      expect(records[1]).to.eq(recordCount);
    });

    it("should not allow non-member to create record", async function () {
      const clearAmount = 1000;
      const encryptedAmount = await fhevm
        .createEncryptedInput(shadowLedgerContractAddress, signers.bob.address)
        .add128(clearAmount)
        .encrypt();

      await expect(
        shadowLedgerContract
          .connect(signers.bob)
          .createRecord(0, encryptedAmount.handles[0], encryptedAmount.inputProof, departmentId, 0, "Test")
      ).to.be.revertedWith("ShadowLedger: only department member");
    });
  });

  describe("Cross-Department Calculations", function () {
    let departmentId1: bigint;
    let departmentId2: bigint;

    beforeEach(async function () {
      // Create two departments
      let tx = await shadowLedgerContract
        .connect(signers.deployer)
        .createDepartment("Engineering", signers.alice.address);
      await tx.wait();
      departmentId1 = 2n;

      tx = await shadowLedgerContract
        .connect(signers.deployer)
        .createDepartment("Sales", signers.bob.address);
      await tx.wait();
      departmentId2 = 3n;

      // Alice is already admin of departmentId1, so no need to add

      // Create income records for department 1
      const clearAmount1 = 1000;
      const encryptedAmount1 = await fhevm
        .createEncryptedInput(shadowLedgerContractAddress, signers.alice.address)
        .add128(clearAmount1)
        .encrypt();

      tx = await shadowLedgerContract
        .connect(signers.alice)
        .createRecord(0, encryptedAmount1.handles[0], encryptedAmount1.inputProof, departmentId1, 0, "Income 1");
      await tx.wait();

      // Create income records for department 2
      const clearAmount2 = 2000;
      const encryptedAmount2 = await fhevm
        .createEncryptedInput(shadowLedgerContractAddress, signers.bob.address)
        .add128(clearAmount2)
        .encrypt();

      tx = await shadowLedgerContract
        .connect(signers.bob)
        .createRecord(0, encryptedAmount2.handles[0], encryptedAmount2.inputProof, departmentId2, 0, "Income 2");
      await tx.wait();
    });

    it("should calculate total income across departments", async function () {
      const departmentIds = [departmentId1, departmentId2];
      const result = await shadowLedgerContract.calculateTotalIncome(departmentIds, 0);

      // Decrypt result
      const clearResult = await fhevm.userDecryptEuint(
        FhevmType.euint128,
        result,
        shadowLedgerContractAddress,
        signers.alice,
      );

      expect(clearResult).to.eq(3000n); // 1000 + 2000
    });

    it("should calculate total expense across departments", async function () {
      // Create expense records
      const clearAmount1 = 500;
      const encryptedAmount1 = await fhevm
        .createEncryptedInput(shadowLedgerContractAddress, signers.alice.address)
        .add128(clearAmount1)
        .encrypt();

      let tx = await shadowLedgerContract
        .connect(signers.alice)
        .createRecord(1, encryptedAmount1.handles[0], encryptedAmount1.inputProof, departmentId1, 0, "Expense 1");
      await tx.wait();

      const clearAmount2 = 300;
      const encryptedAmount2 = await fhevm
        .createEncryptedInput(shadowLedgerContractAddress, signers.bob.address)
        .add128(clearAmount2)
        .encrypt();

      tx = await shadowLedgerContract
        .connect(signers.bob)
        .createRecord(1, encryptedAmount2.handles[0], encryptedAmount2.inputProof, departmentId2, 0, "Expense 2");
      await tx.wait();

      const departmentIds = [departmentId1, departmentId2];
      const result = await shadowLedgerContract.calculateTotalExpense(departmentIds, 0);

      const clearResult = await fhevm.userDecryptEuint(
        FhevmType.euint128,
        result,
        shadowLedgerContractAddress,
        signers.alice,
      );

      expect(clearResult).to.eq(800n); // 500 + 300
    });

    it("should calculate net income", async function () {
      // Create expense record
      const clearAmount = 500;
      const encryptedAmount = await fhevm
        .createEncryptedInput(shadowLedgerContractAddress, signers.alice.address)
        .add128(clearAmount)
        .encrypt();

      let tx = await shadowLedgerContract
        .connect(signers.alice)
        .createRecord(1, encryptedAmount.handles[0], encryptedAmount.inputProof, departmentId1, 0, "Expense");
      await tx.wait();

      const departmentIds = [departmentId1];
      const result = await shadowLedgerContract.calculateNetIncome(departmentIds, 0);

      const clearResult = await fhevm.userDecryptEuint(
        FhevmType.euint128,
        result,
        shadowLedgerContractAddress,
        signers.alice,
      );

      expect(clearResult).to.eq(500n); // 1000 - 500
    });
  });

  describe("Audit Management", function () {
    it("should add auditor", async function () {
      const tx = await shadowLedgerContract
        .connect(signers.deployer)
        .addAuditor(signers.charlie.address);
      await tx.wait();

      const isAuditor = await shadowLedgerContract.isAuditor(signers.charlie.address);
      expect(isAuditor).to.be.true;
    });

    it("should remove auditor", async function () {
      // Add auditor first
      let tx = await shadowLedgerContract
        .connect(signers.deployer)
        .addAuditor(signers.charlie.address);
      await tx.wait();

      // Remove auditor
      tx = await shadowLedgerContract
        .connect(signers.deployer)
        .removeAuditor(signers.charlie.address);
      await tx.wait();

      const isAuditor = await shadowLedgerContract.isAuditor(signers.charlie.address);
      expect(isAuditor).to.be.false;
    });

    it("should allow auditor to view all records", async function () {
      // Create department and record
      let tx = await shadowLedgerContract
        .connect(signers.deployer)
        .createDepartment("Engineering", signers.alice.address);
      await tx.wait();

      const clearAmount = 1000;
      const encryptedAmount = await fhevm
        .createEncryptedInput(shadowLedgerContractAddress, signers.alice.address)
        .add128(clearAmount)
        .encrypt();

      tx = await shadowLedgerContract
        .connect(signers.alice)
        .createRecord(0, encryptedAmount.handles[0], encryptedAmount.inputProof, 2n, 0, "Test");
      await tx.wait();

      // Add auditor
      tx = await shadowLedgerContract
        .connect(signers.deployer)
        .addAuditor(signers.charlie.address);
      await tx.wait();

      // Auditor should be able to get all records
      const records = await shadowLedgerContract.connect(signers.charlie).getAllRecords(0, 10);
      expect(records.length).to.be.greaterThan(0);
    });
  });
});

