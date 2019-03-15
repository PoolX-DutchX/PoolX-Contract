pragma solidity ^0.5.2;

import "./IEtherToken.sol";
import "../node_modules/@gnosis.pm/dx-contracts/contracts/DutchExchange.sol";
import "../node_modules/@gnosis.pm/dx-contracts/contracts/Oracle/PriceOracleInterface.sol";
import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

/// @title Provides pooling for dutchX
contract Pool {
    using SafeMath for uint256;

    mapping (address => uint256) public contributorAmountToken1;
    mapping (address => uint256) public contributorAmountToken2;

    uint256 public initialClosingPriceNum;
    uint256 public initialClosingPriceDen;

    DutchExchange public dx;
    IEtherToken public token1;
    ERC20 public token2;

    uint256 public token1Balance;
    uint256 public token2Balance;
    uint256 public newToken1Balance;
    uint256 public newToken2Balance;

    bool public isAuctionWithWeth = true;

    Stages public stage = Stages.Initialize;

    enum Stages {
        Initialize,
        Contribute,
        Collect,
        Claim
    }

    modifier atStage(Stages _stage) {
        require(
            stage == _stage,
            "Function can't be called at this time."
        );
        _;
    }

    function init (
        address _dx,
        address payable _token1,
        address payable _token2,
        uint _initialClosingPriceNum,
        uint _initialClosingPriceDen
    )
        public
        atStage(Stages.Initialize)
    {
        _addTokenPairRequirements(
            _dx,
            _token1,
            _token2,
            _initialClosingPriceNum,
            _initialClosingPriceDen
        );
        dx = DutchExchange(_dx);
        
        require(
            dx.getAuctionIndex(_token1, _token2) == 0,
            "Auction for token pair already started!"
        );

        isAuctionWithWeth = _token1 == dx.ethToken() || _token2 == dx.ethToken();

        if (dx.ethToken() == _token2) {
            token1 = IEtherToken(_token2);
            token2 = ERC20(_token1);
        } else {
            token1 = IEtherToken(_token1);
            token2 = ERC20(_token2);
        }

        initialClosingPriceNum = _initialClosingPriceNum;
        initialClosingPriceDen = _initialClosingPriceDen;
        stage = Stages.Contribute;
    }

    function _addTokenPairRequirements(
        address _dx,
        address _token1,
        address _token2,
        uint256 _initialClosingPriceNum,
        uint256 _initialClosingPriceDen
    ) 
        internal
        pure
    {
        require(address(_dx) != address(0), "_dx can't be 0!");
        require(address(_token1) != address(0), "_token1 can't be 0!");
        require(address(_token2) != address(0), "_token2 can't be 0!");
        require(_initialClosingPriceNum != 0, "_initialClosingPriceNum can't be 0!");
        require(_initialClosingPriceDen != 0, "_initialClosingPriceDen can't be 0!");
        require(_initialClosingPriceNum < 10 ** 18, "_initialClosingPriceNum must be less than 10e18!");
        require(_initialClosingPriceDen < 10 ** 18, "_initialClosingPriceDen must be less than 10e18!");
        require(_token1 != _token2, "token1 and token2 must differ!");
    }

    /**
     * @dev Contribute to a Pool with ether. The stage is finished when ether worth 10000$ 
     *      is collected and a dx token pair (token1/new token is created).
     */
    function contribute(uint256 contributeToken1, uint256 contributeToken2) public payable atStage(Stages.Contribute)
    {
        if (!isAuctionWithWeth){
            require(
                msg.value == 0,
                "Don't send ether for token pairs without Weth!"
            );
        }

        require(
            token1.transferFrom(address(msg.sender), address(this), contributeToken1),
            "Missing contributeToken1 funds for contract!"
        );
        require(
            token2.transferFrom(address(msg.sender), address(this), contributeToken2),
            "Missing contributeToken2 funds for contract!"
        );

        contributorAmountToken1[msg.sender] = contributorAmountToken1[msg.sender].add(contributeToken1).add(msg.value);
        contributorAmountToken2[msg.sender] = contributorAmountToken2[msg.sender].add(contributeToken2);

        emit Contribute(msg.sender, address(token1), contributeToken1);
        emit Contribute(msg.sender, address(token2), contributeToken2);

        token1Balance = token1Balance.add(contributeToken1).add(msg.value);
        token2Balance = token2Balance.add(contributeToken2);

        uint256 fundedValueUSD = isAuctionWithWeth ?
            token1Balance.mul(getEthInUsd())
            : _calculateFundedValueTokenToken(
                address(token1),
                address(token2),
                token1Balance,
                token2Balance,
                getEthInUsd()
            );

        if (fundedValueUSD >= dx.thresholdNewTokenPair()) {
            addTokenPair();
        }
    }

    function _calculateFundedValueTokenToken(
        address _token1,
        address _token2,
        uint token1Funding,
        uint token2Funding,
        uint ethUSDPrice
    )
        internal
        view
        returns (uint256)
    {
        // We require ethToken-Token auctions to exist
        // R3.1
        require(
            dx.getAuctionIndex(_token1, dx.ethToken()) > 0,
            "No auction for token1 exists!"
        );

        // R3.2
        require(
            dx.getAuctionIndex(_token2, dx.ethToken()) > 0,
            "No auction for token2 exists!"
        );

        // Price of Token 1
        uint256 priceToken1Num;
        uint256 priceToken1Den;
        (priceToken1Num, priceToken1Den) = dx.getPriceOfTokenInLastAuction(_token1);

        // Price of Token 2
        uint256 priceToken2Num;
        uint256 priceToken2Den;
        (priceToken2Num, priceToken2Den) = dx.getPriceOfTokenInLastAuction(_token2);

        // Compute funded value in ethToken and USD
        // 10^30 * 10^30 = 10^60
        uint256 fundedValueETH = (token1Funding.mul(priceToken1Num).div(priceToken1Den))
            .add(token2Funding * priceToken2Num / priceToken2Den);

        return fundedValueETH.mul(ethUSDPrice);
    }

    function withdraw() external atStage(Stages.Contribute) {
        require(
            contributorAmountToken1[msg.sender] > 0 || contributorAmountToken2[msg.sender] > 0,
            "No funds for user to withdraw!"
        );

        uint256 contributedToken1 = contributorAmountToken1[msg.sender];
        uint256 contributedToken2 = contributorAmountToken2[msg.sender];

        contributorAmountToken1[msg.sender] = 0;
        contributorAmountToken2[msg.sender] = 0;

        if (isAuctionWithWeth) {
            if (address(this).balance < contributedToken1) {
                contributedToken1 = contributedToken1.sub(address(this).balance);
                address(msg.sender).transfer(address(this).balance);
            } else {
                address(msg.sender).transfer(contributorAmountToken1[msg.sender]);
                contributedToken1 = 0;
            }
        }
        
        require(
            token1.transfer(msg.sender, contributedToken1),
            "Contract has not enough funds of token1 for withdrawal!"
        );
        require(
            token2.transfer(msg.sender, contributedToken2),
            "Contract has not enough funds of token2 for withdrawal!"
        ); 
    }

    function addTokenPair() internal {
        stage = Stages.Collect;
        if(isAuctionWithWeth){
            uint256 ethBalance = address(this).balance;
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
     * @dev Collects the seller funds to the Pool. When successful, allows to collect share. 
     */
    function collectFunds() public atStage(Stages.Collect) {
        stage = Stages.Claim;
        uint256 auctionIndex = dx.getAuctionIndex(address(token1), address(token2));
        
        //should revert if not finished?
        dx.claimSellerFunds(address(token1), address(token2), address(this), 1);
        newToken1Balance = dx.balances(address(token1),address(this));
        newToken2Balance = dx.balances(address(token2),address(this));
        dx.withdraw(address(token1),newToken1Balance);
        dx.withdraw(address(token2),newToken2Balance);
    }

    /**
     * @dev contributors can claim their token share.
     */
    function claimFunds() public atStage(Stages.Claim){
        require(
            contributorAmountToken1[msg.sender] > 0 ||
            contributorAmountToken2[msg.sender] > 0,
            "User has no funds to claim!"
        );

        uint256 shareToken2 = contributorAmountToken1[msg.sender].mul(newToken2Balance).div(token1Balance);
        uint256 shareToken1 = contributorAmountToken2[msg.sender].mul(newToken1Balance).div(token2Balance);

        contributorAmountToken1[msg.sender] = 0;
        contributorAmountToken2[msg.sender] = 0;

        require(
            token1.transfer(msg.sender, shareToken1),
            "Contract has not enough token1 funds for user claim!"
        );
        require(
            token2.transfer(msg.sender, shareToken2),
            "Contract has not enough token2 funds for user claim!"
        );

        emit Claim(msg.sender, shareToken1);
        emit Claim(msg.sender, shareToken2);
    }

    /**
     * @dev Get value of one ether in USD.
     */
    function getEthInUsd() public view returns (uint256) {
        PriceOracleInterface priceOracle = PriceOracleInterface(dx.ethUSDOracle());
        uint256 etherUsdPrice = priceOracle.getUSDETHPrice();
        return etherUsdPrice;
    }

    // Do we need this fallback function??? It gives errors in the PoolCloneFactory when it is uncommented
    // function() external payable {
    //     require(msg.value > 0, "Please send ether to contribute!");
    //     contribute(0, 0);
    // }

    event Contribute(
         address sender,
         address token,
         uint256 amount
    );

    event TokenPair(
         address token1,
         address token2
    );

    event Claim(
         address sender,
         uint256 amount
    );
}