const Pool = artifacts.require('./Pool.sol')
const Token = artifacts.require('./TokenGNO.sol')
const EtherToken = artifacts.require('./EtherToken.sol')
const DutchExchangeProxy = artifacts.require('./DutchExchangeProxy.sol')
const DutchExchange = artifacts.require('./DutchExchange.sol')
const PoolXCloneFactory = artifacts.require('./PoolXCloneFactory.sol')

const { increaseTimeTo, duration } = require('./helpers/timer')
const { BN, balance, constants, expectEvent, shouldFail, ether, should } = require('openzeppelin-test-helpers');


contract('Pool', ([owner, contributor1, contributor2]) => {
    let pool, clonedPool, poolCloneFactory, token, weth, dx, dutchX
    const initialClosingPriceNum = 2
    const initialClosingPriceDen = 1
    const oneEth = ether('1');
  beforeEach(async () => {
    token = await Token.new(web3.utils.toWei("100000000000000000000"))
    weth = await EtherToken.deployed()
    dx = await DutchExchangeProxy.deployed()

    dutchX = DutchExchange.at(dx.address)
    pool = await Pool.new()
    await pool.init(
      dx.address,
      weth.address,
      token.address,
      initialClosingPriceNum,
      initialClosingPriceDen
    )

    // poolCloneFactory = await PoolXCloneFactory.deployed(pool.address)

    // clonedPool = await poolCloneFactory
    //   .createPool(
    //     dx.address,
    //     weth.address,
    //     token.address,
    //     initialClosingPriceNum,
    //     initialClosingPriceDen
    //   )
    //   .then(tx => Pool.at(tx.logs[0].args.newPoolAddress))

    // await token.transfer(pool.address, 10e18);
  })

  describe('#contribute', () => {
    it('should deposit ether in the contract', async () => {
      await pool.contribute(0, 0, { from: contributor1, value: oneEth })
      const contributedAmountToken1 = await pool.contributorAmountToken1(contributor1)
      const poolBalance = await balance.current(pool.address)
      contributedAmountToken1.should.be.bignumber.eq(oneEth)
      poolBalance.should.be.bignumber.eq(oneEth)
    })

    it.only('should deposit weth token in the contract', async () => {

        await weth.deposit({ from: contributor1, value: oneEth })

        await weth.approve(pool.address, oneEth)

        await pool.contribute(oneEth, 0, { from: contributor1})
        // const contributedAmountToken1 = await pool.contributorAmountToken1(contributor1)
        // contributedAmountToken1.should.be.bignumber.eq(oneEth)
        // const auctionIndex = await dx2.getAuctionIndex(weth.address, token.address)
        // auctionIndex.should.be.bignumber.eq(0)
     })

    it('should update the pool funds in USD ', async () => {
      await pool.contribute(0, 0, { from: contributor1, value: oneEth })

      const poolBalanceInUsd = await pool.getEthInUsd()

      poolBalanceInUsd.should.be.bignumber.eq(1100)

     
    })

    it('should be able to list the token', async () => {
        await weth.deposit({ from: contributor1, value: 10e18 })

        await weth.approve(pool.address, 10e18,{ from: contributor1})
        await pool.contribute(10e18,0,{ from: contributor1 })

      // no more ether in pool contract
      const poolBalance = web3.eth.getBalance(pool.address)
      poolBalance.should.be.bignumber.eq(0)

      const auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      )
      // proves that token was listed. Shows that in the dutchX exchange the first auction for the token pair exists
      auctionListedIndex.should.be.bignumber.eq(1)
    })
  })

  describe('#withdraw', () => {
    beforeEach(async () => {
        await pool.contribute(0,0,{
          from: contributor1,
          value: oneEth,
        })
      })
      it('should withdraw weth token from contract', async () => {
        const contributor1BalanceBefore = await web3.eth.getBalance(contributor1)

        await pool.withdraw({ from: contributor1 })
        const contributedAmountToken1 = await pool.contributorAmountToken1(contributor1)
        contributedAmountToken1.should.be.bignumber.eq(0)
        const contributedAmountToken2 = await pool.contributorAmountToken2(contributor1)
        contributedAmountToken2.should.be.bignumber.eq(0)
        const contributor1BalanceAfter = await web3.eth.getBalance(contributor1)
        contributor1BalanceAfter.should.be.bignumber.eq(contributor1BalanceBefore.plus(oneEth))


     })
  })

  describe('#collectFunds', () => {
    beforeEach(async () => {
      await clonedPool.contribute({
        from: owner,
        value: 10e18,
      })
    })

    it('should be able to list the token', async () => {
      const dutchX = DutchExchange.at(dx.address)

      let auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      )
      const auctionStart = (await dutchX.getAuctionStart.call(
        weth.address,
        token.address
      )).toNumber()
      // const auctionStarts = await dutchX.auctionStarts(weth.address, token.address);

      // await increaseTimeTo(auctionStarts);
      await increaseTimeTo(auctionStart + duration.hours(4))

      // // await increaseTime(duration.hours(1));
      await token.approve(dutchX.address, 100e18)
      await dutchX.deposit(token.address, 100e18)

      // eslint-disable-next-line
      const postBuyOrder = await dutchX.postBuyOrder(
        weth.address,
        token.address,
        auctionListedIndex,
        100e18
      )
      auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      )

      let ownerBalance = await token.balanceOf(owner)
      ownerBalance.should.be.bignumber.eq(0)
      await clonedPool.collectFunds()
      await clonedPool.claimFunds()
      ownerBalance = await token.balanceOf(owner)
      console.log('====================================')
      console.log(ownerBalance)
      console.log('====================================')
      ownerBalance = await token.balanceOf(clonedPool.address)
      console.log('====================================')
      console.log(ownerBalance)
      console.log('====================================')
    })
  })

  describe('#claimFunds', () => {})
})
