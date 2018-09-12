
pragma solidity ^0.4.11;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract IEtherToken is ERC20 {

    /// @dev Fallback to calling deposit when ether is sent directly to contract.
    function() public payable;
  

    /// @dev Buys tokens with Ether, exchanging them 1:1.
    function deposit() public payable;
   

    /// @dev Sells tokens in exchange for Ether, exchanging them 1:1.
    /// @param amount Number of tokens to sell.
    function withdraw(uint amount) public;
}