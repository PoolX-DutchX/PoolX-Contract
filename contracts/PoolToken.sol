pragma solidity ^0.4.21;

// import "@gnosis.pm/util-contracts/contracts/Token.sol";
// import "@gnosis.pm/util-contracts/contracts/EtherToken.sol";
import "./IEtherToken.sol";

import "../node_modules/@gnosis.pm/dx-contracts/contracts/DutchExchange.sol";
import "../node_modules/@gnosis.pm/dx-contracts/contracts/Oracle/PriceOracleInterface.sol";
import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract PoolToken {
    using SafeMath for uint256;

    mapping (address => uint) public contributerAmountToken1;
    mapping (address => uint) public contributerAmountToken2;

    uint public initialClosingPriceNum;
    uint public initialClosingPriceDen;

    DutchExchange public dx;
    address public token1;
    ERC20 public token2;


    uint public token1Balance;
    uint public token2Balance;
    uint public newToken1Balance;
    uint public newToken2Balance;
    bool public wethAuction = true;
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
        address _token1,
        address _token2,
        uint _initialClosingPriceNum,
        uint _initialClosingPriceDen
    )
        public
        atStage(Stages.Initilize)
    {
        _addTokenPairRequirements(
            _dx,
            _token1,
            _token2,
            _initialClosingPriceNum,
            _initialClosingPriceDen
        );
        dx = DutchExchange(_dx);
        
        require(dx.getAuctionIndex(_token1, _token2) == 0);

        if(dx.ethToken() == _token1){
            token1 = ERC20(_token1);
            token2 = ERC20(_token2);

        } else if (dx.ethToken() == _token2) {
            token1 = ERC20(_token2);
            token2 = ERC20(_token1);
        } else {
            token1 = ERC20(_token1);
            token2 = ERC20(_token2);
            wethAuction = false;

        }

        initialClosingPriceNum = _initialClosingPriceNum;
        initialClosingPriceDen = _initialClosingPriceDen;
        stage = Stages.Contribute;
    }

    function _addTokenPairRequirements(
        address _dx,
        address _token1,
        address _token2,
        uint _initialClosingPriceNum,
        uint _initialClosingPriceDen
    ) internal {
        require(address(_dx) != address(0));
        require(address(_token1) != address(0));
        require(address(_token2) != address(0));
        require(_initialClosingPriceNum != 0);
        require(_initialClosingPriceDen != 0);
        require(_initialClosingPriceNum < 10 ** 18);
        require(_initialClosingPriceDen < 10 ** 18);
        require(_token1 != _token2);
    }

    /**
     * @dev Contibute to a Pool with ether. The stage is finished when ether worth 10000$ 
     *      is collected and a dx token pair (token1/new token is created).
     */
    function contribute(uint contributeToken1, uint contributeToken2) public payable atStage(Stages.Contribute)
    {
        if(!wethAuction){
            require(msg.value == 0);
        }

        require(token1.transferFrom(address(msg.sender), address(this), contributeToken1));
        require(token2.transferFrom(address(msg.sender), address(this), contributeToken2));

        contributerAmountToken1[msg.sender] = contributerAmountToken1[msg.sender].add(contributeToken1).add(msg.value);
        contributerAmountToken2[msg.sender] = contributerAmountToken2[msg.sender].add(contributeToken2);
        emit Contribute(msg.sender, address(token1), contributeToken1);
        emit Contribute(msg.sender, address(token2), contributeToken2);
        token1Balance = token1Balance.add(contributeToken1).add(msg.value);
        token2Balance = token2Balance.add(contributeToken2);
        uint fundedValueUSD;
        if(wethAuction){
            fundedValueUSD = token1Balance.mul(getEthInUsd());
        } else{
            address ethTokenMem = dx.ethToken();
            fundedValueUSD = _calculateFundedValueTokenToken(token1, token2, token1Balance, token2Balance, ethTokenMem, getEthInUsd());
        }
        if(fundedValueUSD >= dx.thresholdNewTokenPair()){
            addTokenPair();
        }
    }

    function witdraw() external atStage(Stages.Contribute) {
        require(contributerAmountToken1[msg.sender] > 0 || contributerAmountToken2[msg.sender] > 0);
        uint contributedToken1 = contributerAmountToken1[msg.sender];
        uint contributedToken2 = contributerAmountToken2[msg.sender];
        contributerAmountToken1[msg.sender] = 0;
        contributerAmountToken2[msg.sender] = 0;
        if(wethAuction){
            if(this.balance < contributedToken1){
                contributedToken1 = contributedToken1 - this.balance;
                this.transfer(msg.sender, this.balance);
            } else{
                this.transfer(msg.sender, contributerAmountToken1[msg.sender]);
                contributedToken1 = 0;
            }
        }
        
        require(token1.transfer(msg.sender, contributedToken1));
        require(token2.transfer(msg.sender, contributedToken2));
       
    }

    function () public payable {
        require(msg.value > 0);
        contribute(0, 0);
    }

    function _calculateFundedValueTokenToken(
        address token1,
        address token2,
        uint token1Funding,
        uint token2Funding,
        address ethTokenMem,
        uint ethUSDPrice
    )
        internal
        view
        returns (uint fundedValueUSD)
    {
        // We require there to exist ethToken-Token auctions
        // R3.1
        require(dx.getAuctionIndex(token1, ethTokenMem) > 0);

        // R3.2
        require(dx.getAuctionIndex(token2, ethTokenMem) > 0);

        // Price of Token 1
        uint priceToken1Num;
        uint priceToken1Den;
        (priceToken1Num, priceToken1Den) = dx.getPriceOfTokenInLastAuction(token1);

        // Price of Token 2
        uint priceToken2Num;
        uint priceToken2Den;
        (priceToken2Num, priceToken2Den) = dx.getPriceOfTokenInLastAuction(token2);

        // Compute funded value in ethToken and USD
        // 10^30 * 10^30 = 10^60
        uint fundedValueETH = (token1Funding.mul(priceToken1Num).div(priceToken1Den)).add(token2Funding * priceToken2Num / priceToken2Den);

        fundedValueUSD = fundedValueETH.mul(ethUSDPrice);
    }


    function addTokenPair() internal {
        stage = Stages.Collect;
        if(wethAuction){
            uint ethBalance = address(this).balance;
            IEtherToken(address(token1)).deposit.value(ethBalance)();
        }

        token1.approve(address(dx), token1Balance);
        token2.approve(address(dx), token2Balance);

        dx.deposit(address(token1), token1Balance);
        dx.deposit(address(token2), token2Balance);

        dx.addTokenPair(
            address(token1),
            address(token2),
            token1Balance,
            token2Balance,
            initialClosingPriceNum,
            initialClosingPriceDen
        );
        emit TokenPair(address(token1), address(token2));
    }

    /**
     * @dev Collects the seller funds to the Pool. When succeeds alows to collect share. 
     */
    function collectFunds() public atStage(Stages.Collect) {
        stage = Stages.Claim;
        uint auctionIndex = dx.getAuctionIndex(address(token1), address(token2));
        
        //should revert if not finsihed?
        dx.claimSellerFunds(address(token1), address(token2), address(this), auctionIndex);
        newToken1Balance = dx.balances(address(token1),address(this));
        newToken2Balance = dx.balances(address(token2),address(this));
        dx.withdraw(address(token1),newToken1Balance);
        dx.withdraw(address(token2),newToken2Balance);
    }

    /**
     * @dev Each contributer can claim there token share with this function.
     */
    function claimFunds() public atStage(Stages.Claim){
        require(contributerAmountToken1[msg.sender] > 0 || contributerAmountToken2[msg.sender] > 0);

        uint shareToken2 = contributerAmountToken1[msg.sender].mul(newToken2Balance).div(token1Balance);
        uint shareToken1 = contributerAmountToken2[msg.sender].mul(newToken1Balance).div(token2Balance);

        contributerAmountToken1[msg.sender] = 0;
        contributerAmountToken2[msg.sender] = 0;

        require(token1.transfer(msg.sender, shareToken1));
        require(token2.transfer(msg.sender, shareToken2));
        emit Claim(msg.sender, shareToken1);
        emit Claim(msg.sender, shareToken2);
    }

    /**
     * @dev Get value of one eth in USD.
     */
    function getEthInUsd() public view returns (uint) {
        PriceOracleInterface priceOracle = PriceOracleInterface(dx.ethUSDOracle());
        uint etherUsdPrice = priceOracle.getUSDETHPrice();
        return etherUsdPrice;
    }


    event Contribute(
         address sender,
         address token,
         uint amount
    );

    event TokenPair(
         address token1,
         address token2
    );

    event Claim(
         address sender,
         uint amount
    );
}