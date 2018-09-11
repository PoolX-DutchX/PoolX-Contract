pragma solidity ^0.4.21;

import "@gnosis.pm/util-contracts/contracts/Token.sol";
import "@gnosis.pm/util-contracts/contracts/EtherToken.sol";

import "@gnosis.pm/dx-contracts/contracts/DutchExchange.sol";
import "@gnosis.pm/dx-contracts/contracts/Oracle/PriceOracleInterface.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";

contract Pool {
    using SafeMath for uint256;

    mapping (address => uint) public contributerAmount;
    uint public initialClosingPriceNum;
    uint public initialClosingPriceDen;

    DutchExchange public dx;
    EtherToken public weth;
    Token public token;


    uint public ethBalance;
    uint public tokenBalance;
    Stages public stage = Stages.Initilize;

    enum Stages {
        Initilize,
        Contribute,
        Collect,
        Claim
    }

    modifier atStage(Stages _stage) {
        require(
            stage == _stage,
            "Function cannot be called at this time."
        );
        _;
    }

    function init (
        address _dx,
        address _weth,
        address _token,
        uint _initialClosingPriceNum,
        uint _initialClosingPriceDen
    )
        public
        atStage(Stages.Initilize)
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
        stage = Stages.Contribute;
    }

    function contribute() public payable atStage(Stages.Contribute)
    {
        require(msg.value > 0);

        contributerAmount[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);

        if(getBalanceInUsd() >= 10000 ether){
            addTokenPair();
        }
    }

    function addTokenPair() internal {
        stage = Stages.Collect;
        ethBalance = address(this).balance;

        weth.deposit.value(ethBalance)();
        weth.approve(address(dx), ethBalance);

        dx.deposit( address(weth), ethBalance);
        dx.addTokenPair(
            address(weth),
            address(token),
            ethBalance,
            0,
            initialClosingPriceNum,
            initialClosingPriceDen
        );
        emit TokenPair(address(weth), address(token));
    }

    function collectFunds() public atStage(Stages.Collect) {

        stage = Stages.Claim;
        uint auctionIndex = dx.getAuctionIndex(address(weth), address(token));

        dx.claimSellerFunds(address(weth), address(token), address(this), auctionIndex);
        tokenBalance = token.balanceOf(this);
    }


    function claimFunds() public atStage(Stages.Claim){
        require(contributerAmount[msg.sender] > 0);

        uint amount = contributerAmount[msg.sender].mul(tokenBalance).div(ethBalance);
        contributerAmount[msg.sender] = 0;


        require(token.transfer(msg.sender, amount));
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