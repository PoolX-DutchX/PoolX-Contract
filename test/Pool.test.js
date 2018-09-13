const Pool = artifacts.require("./Pool.sol");
const Token = artifacts.require("./TokenGNO.sol");
const EtherToken = artifacts.require("./EtherToken.sol");
const DutchExchangeProxy = artifacts.require("./DutchExchangeProxy.sol");
const DutchExchange = artifacts.require("./DutchExchange.sol");
const PoolXCloneFactory = artifacts.require("./PoolXCloneFactory.sol");
const BigNumber = web3.BigNumber;


const {increaseTime, increaseTimeTo, duration} = require("openzeppelin-solidity/test/helpers/increaseTime");

const should = require("chai")
  .use(require("chai-as-promised"))
  .use(require("chai-bignumber")(BigNumber))
  .should();

contract("Pool", ([owner, user1]) => {
  let pool, clonedPool, poolCloneFactory, token, weth, dx;
  const initialClosingPriceNum = 2;
  const initialClosingPriceDen = 1;

  beforeEach(async () => {
    token = await Token.new(100e18);
    weth = await EtherToken.deployed();
    dx = await DutchExchangeProxy.deployed();
    pool = await Pool.new();
    await pool.init(
      dx.address,
      weth.address,
      token.address,
      initialClosingPriceNum,
      initialClosingPriceDen
    );

    poolCloneFactory = await PoolXCloneFactory.deployed(pool.address);
    
    clonedPool = await poolCloneFactory.createPool(
      dx.address,
      weth.address,
      token.address,
      initialClosingPriceNum,
      initialClosingPriceDen
    ).then(tx => Pool.at(tx.logs[0].args.newPoolAddress))
   

    // await token.transfer(pool.address, 10e18);
  });
  
  describe("#contribute", () => {
    it("should deposit ether in the contract", async () => {
      await pool.contribute({ from: owner, value: 1e18 });

      const poolBalance = await web3.eth.getBalance(pool.address);
      poolBalance.should.be.bignumber.eq(1e18);
    });

    it("should update the pool funds in USD ", async () => {
      await pool.contribute({ from: owner, value: 1e18 });

      const poolBalanceInUsd = await pool.getBalanceInUsd();
      poolBalanceInUsd.should.be.bignumber.eq(1100e18);
    });

    it("should be able to list the token", async () => {
      await clonedPool.contribute({
        from: owner,
        value: 10e18
      });

      // no more ether in pool contract
      const poolBalance = web3.eth.getBalance(pool.address);
      poolBalance.should.be.bignumber.eq(0);

      // need to get dutchX from DutchExchange
      const dutchX = DutchExchange.at(dx.address);

      const auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      );
      // proves that token was listed. Shows that in the dutchX exchange the first auction for the token pair exists
      auctionListedIndex.should.be.bignumber.eq(1);
    });
  });
  describe("#collectFunds", () => {
    beforeEach(async () => {
      await clonedPool.contribute({
        from: owner,
        value: 10e18
      });
    });

    it("should be able to list the token", async () => {
      const dutchX = DutchExchange.at(dx.address);

      let auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      );
      const auctionStart = (await dutchX.getAuctionStart.call(weth.address, token.address)).toNumber()
      // const auctionStarts = await dutchX.auctionStarts(weth.address, token.address);
 
      
      // await increaseTimeTo(auctionStarts);
      await increaseTimeTo(auctionStart+ duration.hours(4));

      // // await increaseTime(duration.hours(1));
      await token.approve(dutchX.address, 100e18);
      await dutchX.deposit(token.address, 100e18);
      const postBuyOrder = await dutchX.postBuyOrder(
            weth.address,
            token.address,
            auctionListedIndex,
            100e18
      );
      auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      );

      let ownerBalance = await token.balanceOf(owner);
      ownerBalance.should.be.bignumber.eq(0);
      await clonedPool.collectFunds();
      await clonedPool.claimFunds();
      ownerBalance = await token.balanceOf(owner);
      console.log('====================================');
      console.log(ownerBalance);
      console.log('====================================');
      ownerBalance = await token.balanceOf(clonedPool.address);
      console.log('====================================');
      console.log(ownerBalance);
      console.log('====================================');
    });

  });

  describe("#claimFunds", () => {
  });
});
