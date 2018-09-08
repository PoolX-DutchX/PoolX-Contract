const Pool = artifacts.require("./Pool.sol");
const Token = artifacts.require("./StandardToken.sol");
const EtherToken = artifacts.require("./EtherToken.sol");
const DutchExchangeProxy = artifacts.require("DutchExchangeProxy");

const BigNumber = web3.BigNumber;

const should = require("chai")
  .use(require("chai-as-promised"))
  .use(require("chai-bignumber")(BigNumber))
  .should();

contract("Pool", ([owner, user1]) => {
  let pool, token, weth, dx;
  const initialClosingPriceNum = 1;
  const initialClosingPriceDen = 1;
  
  beforeEach(async () => {
    token = await Token.new();
    weth = await EtherToken.deployed();
    dx = await DutchExchangeProxy.deployed();

    pool = await Pool.new(
      dx.address,
      weth.address,
      token.address,
      initialClosingPriceNum,
      initialClosingPriceDen
    );
    // dx.setupDutchExchange(
    //   TokenFRT _frtToken,
    //   TokenOWL _owlToken,
    //   address _auctioneer, 
    //   address _ethToken,
    //   PriceOracleInterface _ethUSDOracle,
    //   uint _thresholdNewTokenPair,
    //   uint _thresholdNewAuction
    // )
  });

  describe("#deposit", () => {
    it("should deposit ether in the contract", async () => {

        await pool.deposit({from: owner, value: 1e18})
        // await pool.addToken()
        console.log(await dx.thresholdNewTokenPair())
        console.log('====================================');
        console.log(await pool.getBalanceInUsd(1e18));
        console.log('====================================');
        const poolBalance = web3.eth.getBalance(pool.address)
        poolBalance.should.be.bignumber.eq(1e18)
    });
  });
});
