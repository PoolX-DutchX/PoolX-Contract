pragma solidity ^0.4.21;

import "../node_modules/@gnosis.pm/util-contracts/contracts/EtherToken.sol";

contract Weth is EtherToken{

    function() external payable {
        deposit();
    }
}

