pragma solidity ^0.5.2;

import "./Pool.sol";
import "./CloneFactory.sol";
import "../node_modules/openzeppelin-solidity/contracts/ownership/Ownable.sol";

/// @title Allows to create a new pool
contract PoolXCloneFactory is Ownable, CloneFactory {
    address public libraryAddress;

    event PoolCreated(address newPoolAddress);

    constructor(address _libraryAddress) public {
        libraryAddress = _libraryAddress;
    }

    function setLibraryAddress(address _libraryAddress) public onlyOwner {
        libraryAddress = _libraryAddress;
    }

    function createPool(
        address _dx,
        address payable _weth,
        address _token,
        uint _initialClosingPriceNum,
        uint _initialClosingPriceDen
    ) public onlyOwner {
        address clone = createClone(libraryAddress);
        Pool(clone).init(
            _dx,
            _weth,
            _token,
            _initialClosingPriceNum,
            _initialClosingPriceDen
        );
        emit PoolCreated(address(clone));
    }

}