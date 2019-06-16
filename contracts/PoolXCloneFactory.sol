pragma solidity ^0.5.2;

import "./Pool.sol";
import "./CloneFactory.sol";
import "../node_modules/openzeppelin-solidity/contracts/ownership/Ownable.sol";

/// @title Allows to create a new pool
contract PoolXCloneFactory is Ownable, CloneFactory {
    address public libraryAddress;

    event PoolCreated(address newPoolAddress);
    address[] public pools;

    constructor(address _libraryAddress) public {
        libraryAddress = _libraryAddress;
    }

    function setLibraryAddress(address _libraryAddress) public onlyOwner {
        libraryAddress = _libraryAddress;
    }

    function createPool(
        address _dx,
        address payable _token1,
        address payable _token2,
        uint256 _initialClosingPriceNum,
        uint256 _initialClosingPriceDen,
        string memory _name,
        string memory _description

    ) public {
        address clone = createClone(libraryAddress);
        Pool(clone).init(
            _dx,
            _token1,
            _token2,
            _initialClosingPriceNum,
            _initialClosingPriceDen,
            _name,
            _description
        );
        pools.push(address(clone));
        emit PoolCreated(address(clone));
    }

    function getPools() public view returns(address[] memory){
        return pools;
    }
}