pragma solidity ^0.5.2;

import "./IEtherToken.sol";
import "../node_modules/@gnosis.pm/dx-contracts/contracts/DutchExchange.sol";
import "../node_modules/@gnosis.pm/dx-contracts/contracts/Oracle/PriceOracleInterface.sol";
import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

/// @title Pooling mechanism for DutchX
contract Pool {
    using SafeMath for uint256;

    mapping (address => uint256) public contributorToken1Amount;
    mapping (address => uint256) public contributorToken2Amount;

    uint256 public initialClosingPriceNum;
    uint256 public initialClosingPriceDen;
    string public name;
    string public description;

    DutchExchange public dx;
    ERC20 public token1;
    ERC20 public token2;

    uint256 public token1Balance;
    uint256 public token2Balance;

    uint256 public newToken1Balance;
    uint256 public newToken2Balance;

    bool public isAuctionWithWeth;
    bool public token1ThresholdReached;
    bool public token2ThresholdReached;

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
            "Wrong pooling stage. Action not allowed."
        );
        _;
    }

    /// @dev initialization function for a pool. Must be called to start an auction
    /// @param _dx is the address of the DutchX exchange
    /// @param _token1 is the address of the first ERC20 token or Wrapped eth (weth) in the token pair to be listed
    /// @param _token2 is the address of the second ERC20 token or Wrapped eth (weth) in the token pair to be listed
    /// @param _initialClosingPriceNum initial price will be 2 * initialClosingPrice. This is its numerator
    /// @param _initialClosingPriceDen initial price will be 2 * initialClosingPrice. This is its denominator
    function init(
        address _dx,
        address payable _token1,
        address payable _token2,
        uint _initialClosingPriceNum,
        uint _initialClosingPriceDen,
        string calldata _name,
        string calldata _description
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
        } else if (isAuctionWithWeth) {
            token1 = IEtherToken(_token1);
            token2 = ERC20(_token2);
        } else {
            token1 = ERC20(_token1);
            token2 = ERC20(_token2);
        }

        initialClosingPriceNum = _initialClosingPriceNum;
        initialClosingPriceDen = _initialClosingPriceDen;
        name = _name;
        description = _description;
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

    /// @dev Contribute to a Pool. The stage is finished when amount collected
    ///  has a USD funded value higher than the DutchX tokenPair threshold.
    ///  A dx token pair (token1/new token is created).
    /// @param contributeToken1 is the amount of contribution with token1
    /// @param contributeToken2 is the amount to contribute with token2
    function contribute(uint256 contributeToken1, uint256 contributeToken2) public payable atStage(Stages.Contribute)
    {
        require(
            msg.value == 0,
            "Don't send ether, use WETH for auctions with ether!"
        );

        require(
            contributeToken1 == 0 || !token1ThresholdReached,
            "Don't send token1, threshold is reached!"
        );

        require(
            contributeToken2 == 0 || !token2ThresholdReached,
            "Don't send token2, threshold is reached!"
        );

        require(
            token1.transferFrom(address(msg.sender), address(this), contributeToken1),
            "Missing contributeToken1 funds for contract!"
        );
        require(
            token2.transferFrom(address(msg.sender), address(this), contributeToken2),
            "Missing contributeToken2 funds for contract!"
        );

        contributorToken1Amount[msg.sender] = contributorToken1Amount[msg.sender].add(contributeToken1);
        contributorToken2Amount[msg.sender] = contributorToken2Amount[msg.sender].add(contributeToken2);

        emit Contribute(msg.sender, address(token1), contributeToken1);
        emit Contribute(msg.sender, address(token2), contributeToken2);

        token1Balance = token1Balance.add(contributeToken1);
        token2Balance = token2Balance.add(contributeToken2);

        if (_thresholdIsReached()) {
            _addTokenPair();
        }
    }

    function buyAndCollect() public atStage(Stages.Collect) {
        _buyTokens();
        _collectFunds();

        stage = Stages.Claim;
    }

    function currentDxThreshold() public view returns(uint256) {
        return dx.thresholdNewTokenPair();
    }

    function getFundedValueInUsd() public view returns (uint256, uint256) {
        uint256 token1FundedValueUSD;
        uint256 token2FundedValueUSD;
        uint256 token2FundedValueAsToken1 = token2Balance
            .mul(initialClosingPriceDen)
            .div(initialClosingPriceNum);
        // DutchX requires ethToken-Token auctions to exist
        if (!isAuctionWithWeth) {
            require(
                dx.getAuctionIndex(address(token1), dx.ethToken()) > 0,
                "No WETH in the pair and no WETH auction for token1!"
            );
            require(
                dx.getAuctionIndex(address(token2), dx.ethToken()) > 0,
                "No WETH in the pair and no WETH auction for token2!"
            );

            (uint256 priceToken1Num, uint256 priceToken1Den) =
                dx.getPriceOfTokenInLastAuction(address(token1));
            uint256 token1FundedValueETH = token1Balance.mul(priceToken1Num).div(priceToken1Den);

            token1FundedValueUSD = token1FundedValueETH.mul(getEthInUsd());

            token2FundedValueUSD = token2FundedValueAsToken1
                .mul(getEthInUsd()
                .mul(priceToken1Num)
                .div(priceToken1Den));
        } else {
            token1FundedValueUSD = token1Balance.mul(getEthInUsd());
            token2FundedValueUSD = token2FundedValueAsToken1.mul(getEthInUsd());
        }

        return (token1FundedValueUSD, token2FundedValueUSD);
    }

    function _thresholdIsReached() private returns (bool) {
        (uint256 token1FundedValueUSD, uint256 token2FundedValueUSD) = getFundedValueInUsd();

        if (!token1ThresholdReached && token1FundedValueUSD >= dx.thresholdNewTokenPair()) {
            token1ThresholdReached = true;

            uint256 refund = _refundTokenAboveThreshold(
                token1,
                token1FundedValueUSD
            );

            token1Balance = token1Balance.sub(refund);
            contributorToken1Amount[msg.sender] = contributorToken1Amount[msg.sender].sub(refund);
        }

        //Halving token2FundedValueUSD as the token1 initial price in an auction is doubled (at start time)
        uint256 halvedToken2FundedValueUSD = token2FundedValueUSD.div(2);
        if (!token2ThresholdReached && halvedToken2FundedValueUSD >= dx.thresholdNewTokenPair()) {
            token2ThresholdReached = true;
            uint256 refund = _refundTokenAboveThreshold(
                token2,
                halvedToken2FundedValueUSD
            );

            token2Balance = token2Balance.sub(refund);
            contributorToken2Amount[msg.sender] = contributorToken2Amount[msg.sender].sub(refund);
        }

        return token1ThresholdReached && token2ThresholdReached;
    }

    function _refundTokenAboveThreshold(
        ERC20 _token,
        uint256 fundedValueUSD
    )
        private
        returns (uint256)
    {
        uint256 refundUSD = fundedValueUSD.sub(dx.thresholdNewTokenPair());
        uint256 refundETH = refundUSD.div(getEthInUsd());
        uint256 refundToken;

        if (isAuctionWithWeth) {
            if (_token == token1) {
                refundToken = refundETH;
            } else {
                refundToken = refundETH.mul(initialClosingPriceNum).div(initialClosingPriceDen);
            }
        } else {
            (uint256 priceToken1Num, uint256 priceToken1Den) =
            dx.getPriceOfTokenInLastAuction(address(token1));
            uint256 refundEthAsToken1 = refundETH.mul(priceToken1Den).div(priceToken1Num);
            if (_token == token1) {
                refundToken = refundEthAsToken1;
            } else {
                //token1 -> token2
                refundToken = refundEthAsToken1
                .mul(initialClosingPriceNum).div(initialClosingPriceDen);
            }
        }

        require(refundToken <= _token.balanceOf(address(this)), 'Pool can\'t refund!');

        if (refundToken > 0) {
            require(
                _token.transfer(msg.sender, refundToken),
                "Token refund failed!"
            );
        }

        return refundToken;
    }

    function _collectFunds() private {
        // claim funds to pool
        dx.claimSellerFunds(address(token1), address(token2), address(this), 1);
        dx.claimBuyerFunds(address(token1), address(token2), address(this), 1);

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

    function _addTokenPair() private {
        token1.approve(address(dx), token1Balance);
        dx.deposit(address(token1), token1Balance);

        dx.addTokenPair(
            address(token1),
            address(token2),
            token1Balance,
            0, // token2Balance is used for buy side
            initialClosingPriceNum,
            initialClosingPriceDen
        );
        emit TokenPair(address(token1), address(token2), token1Balance);

        stage = Stages.Collect;
    }

    function _buyTokens() private {
        uint256 auctionIndex = dx.getAuctionIndex(address(token1), address(token2));

        token2.approve(address(dx), token2Balance);
        dx.deposit(address(token2), token2Balance);
        dx.postBuyOrder(address(token1), address(token2), auctionIndex, token2Balance);
    }

    function _transferTokensToUser(
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

    /// @dev contributors can claim their token share.
    function claimFunds() external atStage(Stages.Claim){
        require(
            contributorToken1Amount[msg.sender] > 0 ||
            contributorToken2Amount[msg.sender] > 0,
            "User has no funds to claim!"
        );

        if (token1Balance > 0) {
            _transferTokensToUser(
                token2,
                contributorToken1Amount[msg.sender],
                newToken2Balance,
                token1Balance
            );
            contributorToken1Amount[msg.sender] = 0;
        }

        if (token2Balance > 0) {
            _transferTokensToUser(
                token1,
                contributorToken2Amount[msg.sender],
                newToken1Balance,
                token2Balance
            );
            contributorToken2Amount[msg.sender] = 0;
        }
    }

    /// @dev Get value of one ether in USD.
    function getEthInUsd() public view returns (uint256) {
        PriceOracleInterface priceOracle = PriceOracleInterface(dx.ethUSDOracle());
        uint256 etherUsdPrice = priceOracle.getUSDETHPrice();
        return etherUsdPrice;
    }

    event Contribute(
        address sender,
        address token,
        uint256 amount
    );

    event TokenPair(
        address token1,
        address token2,
        uint256 token1Balance
    );

    event Claim(
        address sender,
        uint256 amount
    );
}
