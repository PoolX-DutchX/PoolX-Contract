pragma solidity ^0.4.21;

import "./Pool.sol";
import "@optionality.io/clone-factory/contracts/CloneFactory.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";


contract PoolXCloneFactory is Ownable, CloneFactory {

  address public libraryAddress;

  event PoolCreated(address newPoolAddress);

  function PoolXCloneFactory(address _libraryAddress) public {
    libraryAddress = _libraryAddress;
  }

  function setLibraryAddress(address _libraryAddress) public onlyOwner {
    libraryAddress = _libraryAddress;
  }

  function createPool(
        address _dx,
        address _weth,
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
    PoolCreated(clone);
  }

}