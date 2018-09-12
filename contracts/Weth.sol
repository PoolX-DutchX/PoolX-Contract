pragma solidity ^0.4.21;

import "@gnosis.pm/util-contracts/contracts/EtherToken.sol";

contract Weth is EtherToken{

    function() payable {
        deposit();
    }
}

