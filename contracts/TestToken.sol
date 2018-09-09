pragma solidity ^0.4.21;

import "@gnosis.pm/util-contracts/contracts/StandardToken.sol";


contract TestToken is StandardToken {
    string public constant symbol = "PXT";
    string public constant name = "PoolX Token";
    function TestToken(
    	uint amount
    )
    	public 
    {
        totalTokens = amount;
    	balances[msg.sender] = amount;
    }
}
