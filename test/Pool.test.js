const Pool = artifacts.require('./Pool.sol')
const Token = artifacts.require('./TokenGNO.sol')
const EtherToken = artifacts.require('./EtherToken.sol')
const DutchExchangeProxy = artifacts.require('./DutchExchangeProxy.sol')
const DutchExchange = artifacts.require('./DutchExchange.sol')
// const PoolXCloneFactory = artifacts.require('./PoolXCloneFactory.sol')

const { duration } = require('./helpers/timer')
const {
  BN,
  balance,
  shouldFail,
  ether,
  time,
} = require('openzeppelin-test-helpers')

contract('Pool', ([owner, contributor1]) => {
  let pool, token, weth, dx, dutchX
  const initialClosingPriceNum = 2
  const initialClosingPriceDen = 1
  const oneEth = ether('1')
  const oneHundredEth = ether('100')
  beforeEach(async () => {
    token = await Token.new(oneHundredEth)
    weth = await EtherToken.deployed()
    dx = await DutchExchangeProxy.deployed()
    dutchX = await DutchExchange.at(dx.address)

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

    // await token.transfer(pool.address, oneEth);
  })

  describe('#contribute', () => {
    it('should deposit ether in the contract', async () => {
      await pool.contributeSellPool(0, 0, { from: contributor1, value: oneEth })
      const contributedSellAmountToken1 = await pool.sellContributorToken1Amount(
        contributor1
      )
      const poolBalance = await balance.current(pool.address)
      contributedSellAmountToken1.should.be.bignumber.eq(oneEth)
      poolBalance.should.be.bignumber.eq(oneEth)
    })

    it('should deposit weth token in the contract', async () => {
      await weth.deposit({ from: contributor1, value: oneEth })
      await weth.approve(pool.address, oneEth, { from: contributor1 })
      await pool.contributeSellPool(oneEth, 0, { from: contributor1 })
      const contributedSellAmountToken1 = await pool.sellContributorToken1Amount(
        contributor1
      )
      contributedSellAmountToken1.should.be.bignumber.eq(oneEth)
      const auctionIndex = await dutchX.getAuctionIndex.call(
        weth.address,
        token.address
      )
      auctionIndex.should.be.bignumber.eq('0')
    })

    it('should update the pool funds in USD ', async () => {
      await pool.contributeSellPool(0, 0, { from: contributor1, value: oneEth })

      const poolBalanceInUsd = await pool.getEthInUsd()

      poolBalanceInUsd.should.be.bignumber.eq('1100')
    })

    it.only('should be able to list the token', async () => {
      await weth.deposit({ from: contributor1, value: oneHundredEth })
      await weth.approve(pool.address, oneHundredEth, { from: contributor1 })
      await pool.contributeSellPool(oneHundredEth, 0, { from: contributor1 })

      await token.transfer(contributor1, oneHundredEth, { from: owner })
      await token.approve(pool.address, oneHundredEth, { from: contributor1 })
      await pool.contributeBuyPool(oneEth, { from: contributor1 })

      // no more ether in pool contract
      const poolBalance = await web3.eth.getBalance(pool.address)
      poolBalance.should.be.eq('0')

      const auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      )
      // proves that token was listed. Shows that in the dutchX exchange the first auction for the token pair exists
      auctionListedIndex.should.be.bignumber.eq('1')
    })

    it('should be able to contribute in token2', async () => {
      await token.transfer(contributor1, oneEth, { from: owner })
      await token.approve(pool.address, oneEth, { from: contributor1 })
      await pool.contributeSellPool(0, oneEth, { from: contributor1 })
      await pool.contributeBuyPool(0, oneEth, { from: contributor1 })
      const contributedSellAmountToken2 = await pool.sellContributorToken2Amount(
        contributor1
      )
      contributedSellAmountToken2.should.be.bignumber.eq(oneEth)
      const auctionIndex = await dutchX.getAuctionIndex.call(
        weth.address,
        token.address
      )
      auctionIndex.should.be.bignumber.eq('0')
    })

    it('should not be able to contribute after start', async () => {
      await weth.deposit({ from: contributor1, value: oneHundredEth })

      await weth.approve(pool.address, oneHundredEth, { from: contributor1 })
      await pool.contributeSellPool(oneHundredEth, 0, { from: contributor1 })

      await weth.deposit({ from: contributor1, value: oneEth })

      await weth.approve(pool.address, oneEth, { from: contributor1 })
      shouldFail.reverting(
        pool.contributeSellPool(oneEth, 0, { from: contributor1 })
      )
    })
  })

  describe('#withdraw', () => {
    beforeEach(async () => {
      await pool.contributeSellPool(0, 0, {
        from: contributor1,
        value: oneEth,
      })
    })

    it('should withdraw eth token from contract', async () => {
      const contributor1BalanceBefore = await balance.current(contributor1)
      const receipt = await pool.withdraw({ from: contributor1 })
      const contributor1BalanceAfter = await balance.current(contributor1)

      const tx = await web3.eth.getTransaction(receipt.tx)
      const gasUsed = new BN(receipt.receipt.gasUsed)
      const gasPrice = new BN(tx.gasPrice)
      const gasCosts = gasUsed.mul(gasPrice)

      const contributedSellAmountToken1 = await pool.sellContributorToken1Amount(
        contributor1
      )
      contributedSellAmountToken1.should.be.bignumber.eq('0')
      const contributedSellAmountToken2 = await pool.sellContributorToken2Amount(
        contributor1
      )
      contributedSellAmountToken2.should.be.bignumber.eq('0')

      contributor1BalanceBefore
        .sub(gasCosts)
        .should.be.bignumber.eq(contributor1BalanceAfter)
    })

    it('should withdraw weth from contract', async () => {
      await weth.deposit({ from: contributor1, value: oneEth })
      await weth.approve(pool.address, oneEth, { from: contributor1 })
      await pool.contributeSellPool(oneEth, 0, { from: contributor1 })
      const contributor1BalanceBefore = await weth.balanceOf(contributor1)
      await pool.withdraw({ from: contributor1 })
      const contributor1BalanceAfter = await weth.balanceOf(contributor1)

      const contributedSellAmountToken1 = await pool.sellContributorToken1Amount(
        contributor1
      )
      contributedSellAmountToken1.should.be.bignumber.eq('0')
      const contributedSellAmountToken2 = await pool.sellContributorToken2Amount(
        contributor1
      )
      contributedSellAmountToken2.should.be.bignumber.eq('0')

      contributor1BalanceBefore
        .add(oneEth)
        .should.be.bignumber.eq(contributor1BalanceAfter)
    })

    it('should withdraw token2 from contract', async () => {
      await token.transfer(contributor1, oneEth, { from: owner })
      await token.approve(pool.address, oneEth, { from: contributor1 })
      await pool.contributeSellPool(0, oneEth, { from: contributor1 })
      await pool.withdraw({ from: contributor1 })
      const contributor1BalanceAfter = await token.balanceOf(contributor1)

      const contributedSellAmountToken1 = await pool.sellContributorToken1Amount(
        contributor1
      )
      contributedSellAmountToken1.should.be.bignumber.eq('0')
      const contributedSellAmountToken2 = await pool.sellContributorToken2Amount(
        contributor1
      )
      contributedSellAmountToken2.should.be.bignumber.eq('0')

      oneEth.should.be.bignumber.eq(contributor1BalanceAfter)
    })

    it('should not be able to withdraw when token is added to dx', async () => {
      await weth.deposit({ from: contributor1, value: oneHundredEth })

      await weth.approve(pool.address, oneHundredEth, { from: contributor1 })
      await pool.contributeSellPool(oneHundredEth, 0, { from: contributor1 })
      shouldFail.reverting(pool.withdraw({ from: contributor1 }))
    })
  })

  describe('#collectFunds', () => {
    beforeEach(async () => {
      await pool.contributeSellPool(0, 0, {
        from: owner,
        value: oneHundredEth,
      })
    })

    it('should not work before token are sold', async () => {
      const auctionStart = (await dutchX.getAuctionStart.call(
        weth.address,
        token.address
      )).toNumber()

      await time.increaseTo(auctionStart + duration.hours(14))
      auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      )
      shouldFail.reverting(pool.collectFunds())
    })

    it('should not work when funds are already collected', async () => {
      const auctionStart = (await dutchX.getAuctionStart.call(
        weth.address,
        token.address
      )).toNumber()

      await time.increaseTo(auctionStart + duration.hours(14))
      const auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      )
      await token.approve(dutchX.address, oneHundredEth)
      await dutchX.deposit(token.address, oneHundredEth)

      await dutchX.postBuyOrder(
        weth.address,
        token.address,
        auctionListedIndex,
        oneHundredEth
      )
      await time.increaseTo(auctionStart + duration.hours(15))

      await pool.collectFunds()
      shouldFail.reverting(pool.collectFunds())
    })

    it('should be able to collect funds', async () => {
      const auctionStart = (await dutchX.getAuctionStart.call(
        weth.address,
        token.address
      )).toNumber()

      await time.increaseTo(auctionStart + duration.hours(14))
      const auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      )

      await token.approve(dutchX.address, oneHundredEth)
      await dutchX.deposit(token.address, oneHundredEth)

      await dutchX.postBuyOrder(
        weth.address,
        token.address,
        auctionListedIndex,
        oneHundredEth
      )

      let poolBalance = await token.balanceOf(pool.address)

      poolBalance.should.be.bignumber.eq('0')
      await time.increaseTo(auctionStart + duration.hours(15))

      await pool.collectFunds()

      poolBalance = await token.balanceOf(pool.address)

      assert(poolBalance.gt(0))
    })
  })

  describe('#claimFunds', () => {
    beforeEach(async () => {
      await pool.contributeSellPool(0, 0, {
        from: owner,
        value: oneHundredEth,
      })
      const auctionStart = (await dutchX.getAuctionStart.call(
        weth.address,
        token.address
      )).toNumber()

      await time.increaseTo(auctionStart + duration.hours(14))
      let auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      )

      // // await increaseTime(duration.hours(1));
      await token.approve(dutchX.address, oneHundredEth)
      await dutchX.deposit(token.address, oneHundredEth)

      await dutchX.postBuyOrder(
        weth.address,
        token.address,
        auctionListedIndex,
        oneHundredEth
      )
      await time.increaseTo(auctionStart + duration.hours(15))
    })

    it('should not work when funds are NOT collected', async () => {
      shouldFail.reverting(pool.claimFunds())
    })

    it('should not be possible to claim second time', async () => {
      await pool.collectFunds()

      let ownerBalance = await token.balanceOf(owner)
      ownerBalance.should.be.bignumber.eq('0')

      await pool.claimFunds()
      shouldFail.reverting(pool.claimFunds())

      ownerBalance = await token.balanceOf(owner)
      assert(ownerBalance.gt(0))
    })

    it('should claim funds', async () => {
      await pool.collectFunds()

      let ownerBalance = await token.balanceOf(owner)
      ownerBalance.should.be.bignumber.eq('0')

      await pool.claimFunds()
      ownerBalance = await token.balanceOf(owner)
      assert(ownerBalance.gt(0))
    })
  })
})
