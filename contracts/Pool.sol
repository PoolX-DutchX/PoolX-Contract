pragma solidity ^0.4.21;

// import "@gnosis.pm/util-contracts/contracts/Token.sol";
// import "@gnosis.pm/util-contracts/contracts/EtherToken.sol";
import "./IEtherToken.sol";

import "@gnosis.pm/dx-contracts/contracts/DutchExchange.sol";
import "@gnosis.pm/dx-contracts/contracts/Oracle/PriceOracleInterface.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";



contract Pool {
    using SafeMath for uint256;

    mapping (address => uint) public contributerAmount;
    uint public initialClosingPriceNum;
    uint public initialClosingPriceDen;

    DutchExchange public dx;
    IEtherToken public weth;
    ERC20 public token;


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
        _addTokenPairRequirements(
            _dx,
            _weth,
            _token,
            _initialClosingPriceNum,
            _initialClosingPriceDen
        );
        dx = DutchExchange(_dx);
        require(dx.getAuctionIndex(_weth, _token) == 0);

        //dx.ethToken
        weth = IEtherToken(_weth);

        //approvedTokens[tokenAddress] //token already approved
        token = ERC20(_token);
        initialClosingPriceNum = _initialClosingPriceNum;
        initialClosingPriceDen = _initialClosingPriceDen;
        stage = Stages.Contribute;
    }

    function _addTokenPairRequirements(
        address _dx,
        address _weth,
        address _token,
        uint _initialClosingPriceNum,
        uint _initialClosingPriceDen
    ) internal {
        require(address(_dx) != address(0));
        require(address(_weth) != address(0));
        require(address(_token) != address(0));
        require(_initialClosingPriceNum != 0);
        require(_initialClosingPriceDen != 0);
        require(_initialClosingPriceNum < 10 ** 18);
        require(_initialClosingPriceDen < 10 ** 18);
        require(_weth != _token);
    }
    /**
     * @dev Contibute to a Pool with ether. The stage is finished when ether worth 10000$ 
     *      is collected and a dx token pair (weth/new token is created).
     */
    function contribute() public payable atStage(Stages.Contribute)
    {
        require(msg.value > 0);

        contributerAmount[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);


        if(getBalanceInUsd() >= dx.thresholdNewTokenPair()){
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

    /**
     * @dev Collects the seller funds to the Pool. When succeeds alows to collect share. 
     */
    function collectFunds() public atStage(Stages.Collect) {

        stage = Stages.Claim;
        uint auctionIndex = dx.getAuctionIndex(address(weth), address(token));
        
        //should revert if not finsihed?
        dx.claimSellerFunds(address(weth), address(token), address(this), auctionIndex);
        tokenBalance = dx.balances(address(token),address(this));
        dx.withdraw(address(token),tokenBalance);
    }

    /**
     * @dev Each contributer can claim there token share with this function.
     */
    function claimFunds() public atStage(Stages.Claim){
        require(contributerAmount[msg.sender] > 0);

        uint amount = contributerAmount[msg.sender].mul(tokenBalance).div(ethBalance);
        contributerAmount[msg.sender] = 0;

        require(token.transfer(msg.sender, amount));
        emit Claim(msg.sender, amount);

    }

    /**
     * @dev Get the eth value of contract in USD.
     */
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

    event Claim(
         address sender,
         uint amount
    );
}