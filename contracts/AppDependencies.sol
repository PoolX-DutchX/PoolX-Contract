pragma solidity ^0.5.2;

/// @dev  The purpose of this file is just to make sure truffle compiles 
///  all of the dependent contracts when we are in development.
///  For other environments, we just use the compiled contracts from the NPM
///  package

import "../node_modules/@gnosis.pm/dx-contracts/contracts/DxDevDependencies.sol";

contract AppDependencies {}