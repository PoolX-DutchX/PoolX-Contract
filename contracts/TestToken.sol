pragma solidity ^0.4.21;

import "../node_modules/@gnosis.pm/util-contracts/contracts/StandardToken.sol";

contract TestToken is StandardToken {
    string public constant symbol = "PXT";
    string public constant name = "PoolX Token";
    constructor(
    	uint256 amount
    )
    	public 
    {
        totalTokens = amount;
        balances[msg.sender] = amount;
    }
}
