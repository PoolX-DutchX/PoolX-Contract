pragma solidity ^0.5.2;

import "./IEtherToken.sol";
import "../node_modules/@gnosis.pm/dx-contracts/contracts/DutchExchange.sol";
import "../node_modules/@gnosis.pm/dx-contracts/contracts/Oracle/PriceOracleInterface.sol";
import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

/// @title Provides pooling for dutchX
contract Pool {
    using SafeMath for uint256;

    mapping (address => uint256) public contributorToken1Amount;
    mapping (address => uint256) public contributorToken2Amount;

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

    function init(
        address _dx,
        address payable _token1,
        address payable _token2,
        uint _initialClosingPriceNum,
        uint _initialClosingPriceDen
    )
        external
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
        private
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
     * @dev Contribute to a Pool with ether. The stage is finished when ether worth 1000$
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

        contributorToken1Amount[msg.sender] = contributorToken1Amount[msg.sender].add(contributeToken1).add(msg.value);
        contributorToken2Amount[msg.sender] = contributorToken2Amount[msg.sender].add(contributeToken2);

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
            _addTokenPair();
        }
    }

    function _calculateFundedValueTokenToken(
        address _token1,
        address _token2,
        uint token1Funding,
        uint token2Funding,
        uint ethUSDPrice
    )
        private
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
            contributorToken1Amount[msg.sender] > 0 || contributorToken2Amount[msg.sender] > 0,
            "No funds for user to withdraw!"
        );

        uint256 contributedToken1 = contributorToken1Amount[msg.sender];
        uint256 contributedToken2 = contributorToken2Amount[msg.sender];

        contributorToken1Amount[msg.sender] = 0;
        contributorToken2Amount[msg.sender] = 0;

        if (isAuctionWithWeth) {
            uint256 ethRefund = contributedToken1 > address(this).balance
                ? address(this).balance : contributedToken1;
            address(msg.sender).transfer(ethRefund);
            contributedToken1 = contributedToken1.sub(ethRefund); // WETH refund
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

    function _addTokenPair() private {
        stage = Stages.Collect;

        if (isAuctionWithWeth) {
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
    function collectFunds() external atStage(Stages.Collect) {
        stage = Stages.Claim;
        uint256 auctionIndex = dx.getAuctionIndex(address(token1), address(token2));
        require(auctionIndex > 1, 'Auction is not yet finished!');

        dx.claimSellerFunds(address(token1), address(token2), address(this), 1);
        newToken1Balance = dx.balances(address(token1),address(this));
        newToken2Balance = dx.balances(address(token2),address(this));

        require(newToken1Balance > 0 || newToken2Balance > 0, 'There should be funds to withdraw!');

        if (newToken1Balance > 0) {
            dx.withdraw(address(token1), newToken1Balance);
        }

        if (newToken2Balance > 0) {
            dx.withdraw(address(token2), newToken2Balance);
        }
    }

    function transferTokensToUser(
        ERC20 token,
        uint256 contributorTokenAmount,
        uint256 newTokenBalance,
        uint256 tokenBalance
    ) internal {
        uint256 tokenShare = contributorTokenAmount
            .mul(newTokenBalance)
            .div(tokenBalance);

        if (tokenShare > 0) {
            require(
                token.transfer(msg.sender, tokenShare),
                "Contract has not enough token funds for user claim!"
            );
        }
        emit Claim(msg.sender, tokenShare);
    }

    /**
     * @dev contributors can claim their token share.
     */
    function claimFunds() external atStage(Stages.Claim){
        require(
            contributorToken1Amount[msg.sender] > 0 ||
            contributorToken2Amount[msg.sender] > 0,
            "User has no funds to claim!"
        );

        if (token1Balance > 0) {
            transferTokensToUser(
                token2,
                contributorToken1Amount[msg.sender],
                newToken2Balance,
                token1Balance
            );
            contributorToken1Amount[msg.sender] = 0;            
        }

        if (token2Balance > 0) {
            transferTokensToUser(
                token1,
                contributorToken2Amount[msg.sender],
                newToken1Balance,
                token2Balance
            );
            contributorToken2Amount[msg.sender] = 0;
        }
    }

    /**
     * @dev Get value of one ether in USD.
     */
    function getEthInUsd() public view returns (uint256) {
        PriceOracleInterface priceOracle = PriceOracleInterface(dx.ethUSDOracle());
        uint256 etherUsdPrice = priceOracle.getUSDETHPrice();
        return etherUsdPrice;
    }

    // Commented because of errors in PoolCloneFactory - might relate to
    // https://github.com/trufflesuite/truffle/issues/1640
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