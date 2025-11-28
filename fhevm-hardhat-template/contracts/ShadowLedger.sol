// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint128, externalEuint128, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract ShadowLedger is ZamaEthereumConfig {
    enum RecordType {
        Income,
        Expense
    }

    struct Record {
        uint256 id;
        RecordType recordType;
        euint128 amount;
        uint256 departmentId;
        uint256 projectId;
        string description;
        uint256 timestamp;
        address creator;
        bool exists;
    }

    struct Department {
        uint256 id;
        string name;
        address[] members;
        address admin;
        uint256 createdAt;
        bool exists;
    }

    struct Calculation {
        uint256 id;
        RecordType calculationType;
        euint128 result;
        uint256[] departmentIds;
        uint256[] projectIds;
        uint256 timestamp;
        bool exists;
    }
    
    uint256 private _recordCounter;
    uint256 private _departmentCounter;
    uint256 private _calculationCounter;
    
    mapping(uint256 => Record) private _records;
    mapping(uint256 => Department) private _departments;
    mapping(uint256 => Calculation) private _calculations;
    mapping(address => uint256[]) private _userDepartments;
    mapping(uint256 => address) private _departmentAdmins;
    mapping(address => bool) private _auditors;
    address private _systemAdmin;
    
    event RecordCreated(
        uint256 indexed recordId,
        RecordType indexed recordType,
        uint256 indexed departmentId,
        address creator
    );
    
    event DepartmentCreated(
        uint256 indexed departmentId,
        string name,
        address admin
    );
    
    event MemberAdded(
        uint256 indexed departmentId,
        address member
    );
    
    event MemberRemoved(
        uint256 indexed departmentId,
        address member
    );
    
    event AuditorAdded(address indexed auditor);
    event AuditorRemoved(address indexed auditor);
    
    event CalculationPerformed(
        uint256 indexed calculationId,
        RecordType calculationType
    );
    
    modifier onlySystemAdmin() {
        require(msg.sender == _systemAdmin, "ShadowLedger: only system admin");
        _;
    }
    
    modifier onlyDepartmentAdmin(uint256 departmentId) {
        require(
            _departmentAdmins[departmentId] == msg.sender,
            "ShadowLedger: only department admin"
        );
        _;
    }
    
    modifier onlyDepartmentMember(uint256 departmentId) {
        require(
            _isDepartmentMember(msg.sender, departmentId),
            "ShadowLedger: only department member"
        );
        _;
    }
    
    modifier onlyAuditor() {
        require(_auditors[msg.sender], "ShadowLedger: only auditor");
        _;
    }
    
    modifier validDepartment(uint256 departmentId) {
        require(_departments[departmentId].exists, "ShadowLedger: invalid department");
        _;
    }
    
    modifier validRecord(uint256 recordId) {
        require(_records[recordId].exists, "ShadowLedger: invalid record");
        _;
    }
    
    constructor() {
        _systemAdmin = msg.sender;
        _departmentCounter = 1;
        _departments[1] = Department({
            id: 1,
            name: "System",
            members: new address[](0),
            admin: msg.sender,
            createdAt: block.timestamp,
            exists: true
        });
        _departmentAdmins[1] = msg.sender;
    }
    
    function createDepartment(
        string memory name,
        address admin
    ) external onlySystemAdmin returns (uint256) {
        require(bytes(name).length > 0, "ShadowLedger: empty name");
        require(admin != address(0), "ShadowLedger: invalid admin");
        
        _departmentCounter++;
        uint256 departmentId = _departmentCounter;
        
        address[] memory members = new address[](1);
        members[0] = admin;
        
        _departments[departmentId] = Department({
            id: departmentId,
            name: name,
            members: members,
            admin: admin,
            createdAt: block.timestamp,
            exists: true
        });
        
        _departmentAdmins[departmentId] = admin;
        _userDepartments[admin].push(departmentId);
        
        emit DepartmentCreated(departmentId, name, admin);
        return departmentId;
    }
    
    function addDepartmentMember(
        uint256 departmentId,
        address member
    ) external onlyDepartmentAdmin(departmentId) validDepartment(departmentId) {
        require(member != address(0), "ShadowLedger: invalid member");
        require(
            !_isDepartmentMember(member, departmentId),
            "ShadowLedger: already member"
        );
        
        _departments[departmentId].members.push(member);
        _userDepartments[member].push(departmentId);
        
        emit MemberAdded(departmentId, member);
    }
    
    function removeDepartmentMember(
        uint256 departmentId,
        address member
    ) external onlyDepartmentAdmin(departmentId) validDepartment(departmentId) {
        require(
            _isDepartmentMember(member, departmentId),
            "ShadowLedger: not a member"
        );
        require(
            member != _departments[departmentId].admin,
            "ShadowLedger: cannot remove admin"
        );
        
        address[] storage members = _departments[departmentId].members;
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == member) {
                members[i] = members[members.length - 1];
                members.pop();
                break;
            }
        }
        
        uint256[] storage userDepts = _userDepartments[member];
        for (uint256 i = 0; i < userDepts.length; i++) {
            if (userDepts[i] == departmentId) {
                userDepts[i] = userDepts[userDepts.length - 1];
                userDepts.pop();
                break;
            }
        }
        
        emit MemberRemoved(departmentId, member);
    }
    
    function getDepartment(
        uint256 departmentId
    ) external view validDepartment(departmentId) returns (
        uint256 id,
        string memory name,
        address[] memory members,
        address admin,
        uint256 createdAt
    ) {
        Department memory dept = _departments[departmentId];
        return (
            dept.id,
            dept.name,
            dept.members,
            dept.admin,
            dept.createdAt
        );
    }
    
    function getUserDepartments(
        address user
    ) external view returns (uint256[] memory) {
        return _userDepartments[user];
    }
    
    function createRecord(
        RecordType recordType,
        externalEuint128 encryptedAmount,
        bytes calldata inputProof,
        uint256 departmentId,
        uint256 projectId,
        string memory description
    ) external onlyDepartmentMember(departmentId) validDepartment(departmentId) returns (uint256) {
        require(bytes(description).length > 0, "ShadowLedger: empty description");
        
        euint128 amount = FHE.fromExternal(encryptedAmount, inputProof);
        
        _recordCounter++;
        uint256 recordId = _recordCounter;
        
        _records[recordId] = Record({
            id: recordId,
            recordType: recordType,
            amount: amount,
            departmentId: departmentId,
            projectId: projectId,
            description: description,
            timestamp: block.timestamp,
            creator: msg.sender,
            exists: true
        });
        
        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender);
        
        if (_departmentAdmins[departmentId] == msg.sender) {
            FHE.allow(amount, msg.sender);
        }
        
        emit RecordCreated(recordId, recordType, departmentId, msg.sender);
        return recordId;
    }
    
    function getRecord(
        uint256 recordId
    ) external view validRecord(recordId) returns (
        uint256 id,
        RecordType recordType,
        euint128 amount,
        uint256 departmentId,
        uint256 projectId,
        string memory description,
        uint256 timestamp,
        address creator
    ) {
        Record memory record = _records[recordId];
        
        require(
            _isDepartmentMember(msg.sender, record.departmentId) || _auditors[msg.sender],
            "ShadowLedger: access denied"
        );
        
        return (
            record.id,
            record.recordType,
            record.amount,
            record.departmentId,
            record.projectId,
            record.description,
            record.timestamp,
            record.creator
        );
    }
    
    function getDepartmentRecords(
        uint256 departmentId,
        uint256 offset,
        uint256 limit
    ) external view onlyDepartmentMember(departmentId) validDepartment(departmentId) returns (uint256[] memory) {
        uint256[] memory recordIds = new uint256[](limit);
        uint256 count = 0;
        uint256 skipped = 0;
        
        for (uint256 i = 1; i <= _recordCounter && count < limit; i++) {
            if (_records[i].exists && _records[i].departmentId == departmentId) {
                if (skipped < offset) {
                    skipped++;
                    continue;
                }
                recordIds[count] = i;
                count++;
            }
        }
        
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = recordIds[i];
        }
        
        return result;
    }
    
    function getAllRecords(
        uint256 offset,
        uint256 limit
    ) external view onlyAuditor returns (uint256[] memory) {
        uint256[] memory recordIds = new uint256[](limit);
        uint256 count = 0;
        uint256 skipped = 0;
        
        for (uint256 i = 1; i <= _recordCounter && count < limit; i++) {
            if (_records[i].exists) {
                if (skipped < offset) {
                    skipped++;
                    continue;
                }
                recordIds[count] = i;
                count++;
            }
        }
        
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = recordIds[i];
        }
        
        return result;
    }
    
    function calculateTotalIncome(
        uint256[] memory departmentIds,
        uint256 projectId
    ) external returns (euint128) {
        euint128 total = FHE.asEuint128(0);
        
        for (uint256 i = 0; i < departmentIds.length; i++) {
            uint256 deptId = departmentIds[i];
            require(_departments[deptId].exists, "ShadowLedger: invalid department");
        }
        
        for (uint256 j = 1; j <= _recordCounter; j++) {
            if (_records[j].exists) {
                Record memory record = _records[j];
                
                bool matchesDept = false;
                for (uint256 k = 0; k < departmentIds.length; k++) {
                    if (record.departmentId == departmentIds[k]) {
                        matchesDept = true;
                        break;
                    }
                }
                bool matchesProject = projectId == 0 || record.projectId == projectId;
                bool isIncome = record.recordType == RecordType.Income;
                
                if (matchesDept && matchesProject && isIncome) {
                    total = FHE.add(total, record.amount);
                }
            }
        }
        
        FHE.allowThis(total);
        FHE.allow(total, msg.sender);
        
        return total;
    }
    
    function calculateTotalExpense(
        uint256[] memory departmentIds,
        uint256 projectId
    ) external returns (euint128) {
        euint128 total = FHE.asEuint128(0);
        
        for (uint256 i = 0; i < departmentIds.length; i++) {
            uint256 deptId = departmentIds[i];
            require(_departments[deptId].exists, "ShadowLedger: invalid department");
        }
        
        for (uint256 j = 1; j <= _recordCounter; j++) {
            if (_records[j].exists) {
                Record memory record = _records[j];
                
                bool matchesDept = false;
                for (uint256 k = 0; k < departmentIds.length; k++) {
                    if (record.departmentId == departmentIds[k]) {
                        matchesDept = true;
                        break;
                    }
                }
                bool matchesProject = projectId == 0 || record.projectId == projectId;
                bool isExpense = record.recordType == RecordType.Expense;
                
                if (matchesDept && matchesProject && isExpense) {
                    total = FHE.add(total, record.amount);
                }
            }
        }
        
        FHE.allowThis(total);
        FHE.allow(total, msg.sender);
        
        return total;
    }
    
    function calculateNetIncome(
        uint256[] memory departmentIds,
        uint256 projectId
    ) external returns (euint128) {
        euint128 totalIncome = this.calculateTotalIncome(departmentIds, projectId);
        euint128 totalExpense = this.calculateTotalExpense(departmentIds, projectId);
        
        euint128 netIncome = FHE.sub(totalIncome, totalExpense);
        
        FHE.allowThis(netIncome);
        FHE.allow(netIncome, msg.sender);
        
        return netIncome;
    }
    
    function saveCalculation(
        RecordType calculationType,
        externalEuint128 encryptedResult,
        bytes calldata inputProof,
        uint256[] memory departmentIds,
        uint256[] memory projectIds,
        string memory description
    ) external returns (uint256) {
        euint128 result = FHE.fromExternal(encryptedResult, inputProof);
        
        _calculationCounter++;
        uint256 calculationId = _calculationCounter;
        
        _calculations[calculationId] = Calculation({
            id: calculationId,
            calculationType: calculationType,
            result: result,
            departmentIds: departmentIds,
            projectIds: projectIds,
            timestamp: block.timestamp,
            exists: true
        });
        
        FHE.allowThis(result);
        FHE.allow(result, msg.sender);
        
        emit CalculationPerformed(calculationId, calculationType);
        return calculationId;
    }
    
    function addAuditor(address auditor) external onlySystemAdmin {
        require(auditor != address(0), "ShadowLedger: invalid auditor");
        require(!_auditors[auditor], "ShadowLedger: already auditor");
        
        _auditors[auditor] = true;
        
        for (uint256 i = 1; i <= _recordCounter; i++) {
            if (_records[i].exists) {
                FHE.allow(_records[i].amount, auditor);
            }
        }
        
        emit AuditorAdded(auditor);
    }
    
    function removeAuditor(address auditor) external onlySystemAdmin {
        require(_auditors[auditor], "ShadowLedger: not an auditor");
        
        _auditors[auditor] = false;
        
        emit AuditorRemoved(auditor);
    }
    
    function isAuditor(address auditor) external view returns (bool) {
        return _auditors[auditor];
    }
    
    function _isDepartmentMember(
        address user,
        uint256 departmentId
    ) private view returns (bool) {
        if (!_departments[departmentId].exists) {
            return false;
        }
        
        if (_departments[departmentId].admin == user) {
            return true;
        }
        
        address[] memory members = _departments[departmentId].members;
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == user) {
                return true;
            }
        }
        
        return false;
    }
    
    function getRecordCount() external view returns (uint256) {
        return _recordCounter;
    }
    
    function getDepartmentCount() external view returns (uint256) {
        return _departmentCounter;
    }
}

