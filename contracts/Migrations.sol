pragma solidity ^0.5.2;

/// @title Standard Truffle Migrations file
/// @dev used to apply yet unapplied scripts in the migration folder
contract Migrations {
    address public owner;
    uint public last_completed_migration;

    modifier restricted () {
        if (msg.sender == owner) _;
    }

    constructor() public {
        owner = msg.sender;
    }

    function setCompleted (uint completed) public restricted {
        last_completed_migration = completed;
    }

    function upgrade (address new_address) public restricted {
        Migrations upgraded = Migrations(new_address);
        upgraded.setCompleted(last_completed_migration);
    }
}