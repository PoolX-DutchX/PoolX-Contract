const Pool = artifacts.require("./Pool.sol");
const Token = artifacts.require("./StandardToken.sol");
const EtherToken = artifacts.require("./EtherToken.sol");
const DutchExchangeProxy = artifacts.require("./DutchExchangeProxy.sol");

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
  });

  describe("test the contract", () => {
    it("should deposit ether in the contract", async () => {
      await pool.contribute({ from: owner, value: 1e18 });

      const poolBalance = await web3.eth.getBalance(pool.address);
      poolBalance.should.be.bignumber.eq(1e18);
    });

    it("should update the translate pool funds to USD ", async () => {
      await pool.contribute({ from: owner, value: 1e18 });

      const poolBalanceInUsd = await pool.getBalanceInUsd();
      poolBalanceInUsd.should.be.bignumber.eq(1100e18);
    });

    it("should list the token", async () => {
      await pool.contribute({ from: owner, value: 10e18 });

      const poolBalance = await web3.eth.getBalance(pool.address);

      poolBalance.should.be.bignumber.eq(10e18);
    });
  });
});
