// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

contract MultiSigWallet {
    event Deposit(address indexed sender, uint256 amount, uint256 balance);
    event Submission(
        address indexed owner,
        uint256 indexed transactionIndex,
        address indexed to,
        uint256 value,
        bytes data
    );
    event Approval(address indexed owner, uint256 indexed transactionIndex);
    event Revocation(address indexed owner, uint256 indexed transactionIndex);
    event Execution(address indexed owner, uint256 indexed transactionIndex);

    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public requiredApprovalCount;

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 currentApprovalCount;
    }
    // mapping from tx index => owner => bool
    mapping(uint256 => mapping(address => bool)) public isApproved;

    Transaction[] public transactions;

    modifier onlyOwner() {
        require(isOwner[msg.sender], "not owner");
        _;
    }

    modifier txExists(uint256 _transactionIndex) {
        require(_transactionIndex < transactions.length, "transaction does not exist");
        _;
    }

    modifier notExecuted(uint256 _transactionIndex) {
        require(
            !transactions[_transactionIndex].executed,
            "transaction already executed"
        );
        _;
    }

    modifier notApproved(uint256 _transactionIndex) {
        require(
            !isApproved[_transactionIndex][msg.sender],
            "transaction already approved"
        );
        _;
    }

    constructor(address[] memory _owners, uint256 _requiredApprovalCount) {
        require(_owners.length > 0, "owners required");
        require(
            _requiredApprovalCount > 0 &&
                _requiredApprovalCount <= _owners.length,
            "invalid number of required Approvals"
        );

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];

            require(owner != address(0), "invalid owner");
            require(!isOwner[owner], "owner not unique");

            isOwner[owner] = true;
            owners.push(owner);
        }

        requiredApprovalCount = _requiredApprovalCount;
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    function submitTransaction(
        address _to,
        uint256 _value,
        bytes memory _data
    ) public onlyOwner {
        uint256 transactionIndex = transactions.length;

        transactions.push(
            Transaction({
                to: _to,
                value: _value,
                data: _data,
                executed: false,
                currentApprovalCount: 0
            })
        );

        emit Submission(msg.sender, transactionIndex, _to, _value, _data);
    }

    function approveTransaction(uint256 _transactionIndex)
        public
        onlyOwner
        txExists(_transactionIndex)
        notExecuted(_transactionIndex)
        notApproved(_transactionIndex)
    {
        Transaction storage transaction = transactions[_transactionIndex];
        transaction.currentApprovalCount += 1;
        isApproved[_transactionIndex][msg.sender] = true;

        emit Approval(msg.sender, _transactionIndex);
    }

    function executeTransaction(uint256 _transactionIndex)
        public
        onlyOwner
        txExists(_transactionIndex)
        notExecuted(_transactionIndex)
    {
        Transaction storage transaction = transactions[_transactionIndex];

        require(
            transaction.currentApprovalCount >= requiredApprovalCount,
            "cannot execute tx"
        );

        transaction.executed = true;

        (bool success, ) = transaction.to.call{value: transaction.value}(
            transaction.data
        );
        require(success, "tx failed");

        emit Execution(msg.sender, _transactionIndex);
    }

    function revokeApproval(uint256 _transactionIndex)
        public
        onlyOwner
        txExists(_transactionIndex)
        notExecuted(_transactionIndex)
    {
        Transaction storage transaction = transactions[_transactionIndex];

        require(isApproved[_transactionIndex][msg.sender], "tx not approved");

        transaction.currentApprovalCount -= 1;
        isApproved[_transactionIndex][msg.sender] = false;

        emit Revocation(msg.sender, _transactionIndex);
    }

    function getOwners() public view returns (address[] memory) {
        return owners;
    }

    function getTransactionCount() public view returns (uint256) {
        return transactions.length;
    }

    function getTransaction(uint256 _transactionIndex)
        public
        view
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 currentApprovalCount
        )
    {
        Transaction storage transaction = transactions[_transactionIndex];

        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.currentApprovalCount
        );
    }
    
    /* TESTING ONLY
    
    Remix
    ["0x5B38Da6a701c568545dCfcB03FcB875f56beddC4","0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2","0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db"], 2
    0x17F6AD8Ef982297579C203069C1DbfFE4348c372,1000000000000000000,0x00

    Truffle
    ["0x5befa6f1953bf7d7552a9582081008e197f6d39e","0xe8214c2c87d644f1a8580100143bea7abfd56b36","0xe02a8f0f6f1b2e40e9603a957eefd0de984f03a0"], 2
    0x03c74a96d57e5269466c221e1466ed7ccb88acbb,1000000000000000000,0x00

    */
    /*
    
    function deposit() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    function getBalance() public view returns(uint) {
        return address(this).balance;
    }
    */
}
