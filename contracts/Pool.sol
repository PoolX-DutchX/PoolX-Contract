pragma solidity ^0.4.21;

import "@gnosis.pm/util-contracts/contracts/Token.sol";
import "@gnosis.pm/util-contracts/contracts/EtherToken.sol";

import "@gnosis.pm/dx-contracts/contracts/DutchExchange.sol";
import "@gnosis.pm/dx-contracts/contracts/Oracle/PriceOracleInterface.sol";

contract Pool {
    address public owner;
    mapping (address => uint) public contributerAmount;
    uint public initialClosingPriceNum;
    uint public initialClosingPriceDen;

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
        emit Deposit(msg.sender, msg.value);

        if(getBalanceInUsd() >= 10000 ether){
            setUpForDutchX();
        }
    }
    
    function setUpForDutchX() internal {

        uint wethBalance = address(this).balance;

        weth.deposit.value(wethBalance)();
        weth.approve(address(dx), wethBalance);
        // token.approve(address(dx), tokenBalance);
        // token.transfer(acct, startingGNO, { from: master }),
        // token.approve(dx.address, startingGNO, { from: acct }),

        dx.deposit( address(weth), wethBalance);
        // dx.deposit( address(token), tokenBalance);
        dx.addTokenPair(
            address(weth),
            address(token),
            wethBalance,
            0,
            initialClosingPriceNum,
            initialClosingPriceDen
        );
        emit TokenPair(address(weth), address(token));
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

    function () public payable {
        contribute();
    }

    event Deposit(
         address sender,
         uint amount
    );

    event TokenPair(
         address weth,
         address token
    );
}