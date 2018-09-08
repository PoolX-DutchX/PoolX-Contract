pragma solidity ^0.4.21;

// NOTE:
//  This file purpose is just to make sure truffle compiles all of depending
//  contracts when we are in development.
//
//  For other environments, we just use the compiled contracts from the NPM
//  package

import "@gnosis.pm/dx-contracts/contracts/DxDevDependencies.sol";
import "@gnosis.pm/gno-token/contracts/TokenGNO.sol";

contract AppDependencies {}