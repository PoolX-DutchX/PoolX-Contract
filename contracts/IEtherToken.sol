
pragma solidity ^0.5.2;

import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

/// @title A token for wrapping Ether
contract IEtherToken is ERC20 {

    /// @dev Fallback to calling deposit when ether is sent directly to contract.
    function() external payable;

    /// @dev Buys tokens with Ether, exchanging them 1:1.
    function deposit() external payable;
   
    /// @dev Sells tokens in exchange for Ether, exchanging them 1:1.
    /// @param amount Number of tokens to sell.
    function withdraw(uint amount) external;
}