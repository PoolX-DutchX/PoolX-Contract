pragma solidity ^0.5.2;

import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";

contract TestToken is ERC20Mintable {
    string public constant symbol = "PXT";
    string public constant name = "PoolX Token";
    
    constructor(uint256 amount) public {
        mint(msg.sender, amount);
    }
}
