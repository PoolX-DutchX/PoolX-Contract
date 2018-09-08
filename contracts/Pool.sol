pragma solidity ^0.4.21;

import "@gnosis.pm/util-contracts/contracts/Token.sol";
import "@gnosis.pm/util-contracts/contracts/EtherToken.sol";

import "@gnosis.pm/dx-contracts/contracts/DutchExchange.sol";
import "@gnosis.pm/dx-contracts/contracts/Oracle/PriceOracleInterface.sol";

contract Pool {
    address public owner;
    mapping (address => uint) public contributerAmount;
    uint initialClosingPriceNum;
    uint initialClosingPriceDen;

    DutchExchange public dx;
    EtherToken public weth;
    Token public token;

    modifier onlyOwner () {
        require(msg.sender == owner);
        _;
    }

    function Pool (
        address _dx,
        address _weth,
        address _token,
        uint _initialClosingPriceNum,
        uint _initialClosingPriceDen
    )
        public
    {
        require(address(_dx) != address(0));
        require(address(_weth) != address(0));
        require(address(_token) != address(0));
        require(_initialClosingPriceDen != 0);

        dx = DutchExchange(_dx);
        weth = EtherToken(_weth);
        token = Token(_token);
        initialClosingPriceNum = _initialClosingPriceNum;
        initialClosingPriceDen = _initialClosingPriceDen;
        owner = msg.sender;
    }

    function contribute() public payable {
        require(msg.value > 0);

        contributerAmount[msg.sender] += msg.value;

        if(getBalanceInUsd() >= 10000 ether){
            setUpForDutchX();
        }

        emit Deposit(msg.sender, msg.value);
    }

    function setUpForDutchX() internal {
        uint balance = address(this).balance;
        //get weth
        weth.deposit.value(balance);

        uint wethBalance = weth.balanceOf(address(this));

        weth.approve(dx, wethBalance);

        wethBalance = dx.deposit(weth, wethBalance);

        dx.addTokenPair(
            address(weth),
            address(token),
            wethBalance,
            0,
            initialClosingPriceNum,
            initialClosingPriceDen
        );
    }

    function updateDutchExchange (DutchExchange _dx) public onlyOwner {
        dx = _dx;
    }

    function getBalanceInUsd() public view returns (uint) {

        // Get the price of ETH
        PriceOracleInterface priceOracle = PriceOracleInterface(dx.ethUSDOracle());
        uint etherUsdPrice = priceOracle.getUSDETHPrice();

        // Return the price in USD:
        return (address(this).balance * etherUsdPrice);
    }


    event Deposit(
         address sender,
         uint amount
    );
}