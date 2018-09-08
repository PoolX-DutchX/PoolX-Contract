const Pool = artifacts.require("./Pool.sol");
const Token = artifacts.require("./TokenGNO.sol");
const EtherToken = artifacts.require("./EtherToken.sol");
const DutchExchangeProxy = artifacts.require("DutchExchangeProxy");

const BigNumber = web3.BigNumber;

const should = require("chai")
  .use(require("chai-as-promised"))
  .use(require("chai-bignumber")(BigNumber))
  .should();

contract("Pool", ([owner, user1]) => {
  let pool, token, weth, dx;
  const initialClosingPriceNum = 2;
  const initialClosingPriceDen = 1;

  beforeEach(async () => {
    token = await Token.new(100e18);
    weth = await EtherToken.deployed();
    dx = await DutchExchangeProxy.deployed();

    pool = await Pool.new(
      dx.address,
      weth.address,
      token.address,
      initialClosingPriceNum,
      initialClosingPriceDen
    );

    await token.transfer(pool.address, 10e18);
  });

  describe("test the contract", () => {
    it("should deposit ether in the contract", async () => {
      await pool.deposit({ from: owner, value: 1e18 });

      const poolBalance = web3.eth.getBalance(pool.address);
      poolBalance.should.be.bignumber.eq(1e18);
    });

    it("should update the translate pool funds to USD ", async () => {
      await pool.deposit({ from: owner, value: 1e18 });
      const poolBalanceInUsd = await pool.getBalanceInUsd();
      poolBalanceInUsd.should.be.bignumber.eq(1100e18);
    });

    it.only("should list the token", async () => {
      await pool.deposit({ from: owner, value: 10e18 });
      await pool.addToken({ from: owner });

      
      const poolBalance = web3.eth.getBalance(pool.address);
console.log('====================================');
console.log(poolBalance);
console.log('====================================');
      console.log(await weth.balanceOf(pool.address))
      // await pool.test({ from: owner});
      // await pool.testdeposit({ from: owner });

      const poolBalanceInUsd = await pool.getBalanceInUsd();
    });
  });
});
