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

const { expect } = require('chai')

contract('Pool', ([owner, contributor]) => {
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
      await pool.contribute(0, 0, { from: contributor, value: oneEth })
      const contributedToken1Amount = await pool.contributorToken1Amount(
        contributor
      )
      const poolBalance = await balance.current(pool.address)
      expect(contributedToken1Amount).to.be.bignumber.eq(oneEth)
      expect(poolBalance).to.bignumber.eq(oneEth)
    })

    it('should deposit weth token in the contract', async () => {
      await weth.deposit({ from: contributor, value: oneEth })
      await weth.approve(pool.address, oneEth, { from: contributor })
      await pool.contribute(oneEth, 0, { from: contributor })
      const contributedToken1Amount = await pool.contributorToken1Amount(
        contributor
      )
      expect(contributedToken1Amount).to.be.bignumber.eq(oneEth)
      const auctionIndex = await dutchX.getAuctionIndex.call(
        weth.address,
        token.address
      )
      expect(auctionIndex).to.be.bignumber.eq('0')
    })

    it('should update the pool funds in USD ', async () => {
      await pool.contribute(0, 0, { from: contributor, value: oneEth })

      const poolBalanceInUsd = await pool.getEthInUsd()

      expect(poolBalanceInUsd).to.be.bignumber.eq('1100')
    })

    it('should be able to list the token', async () => {
      // weth sell side
      await weth.deposit({ from: contributor, value: oneHundredEth })
      await weth.approve(pool.address, oneHundredEth, { from: contributor })

      // token buy side
      await token.transfer(contributor, oneHundredEth, { from: owner })
      await token.approve(pool.address, oneHundredEth, { from: contributor })

      await pool.contribute(oneHundredEth, oneHundredEth, {
        from: contributor,
      })

      // no more ether in pool contract
      const poolBalance = await web3.eth.getBalance(pool.address)
      expect(poolBalance).to.be.eq('0')

      const auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      )
      // proves that token was listed. Shows that in the dutchX exchange the first auction for the token pair exists
      expect(auctionListedIndex).to.be.bignumber.eq('1')
    })

    it('should be able to contribute in token2', async () => {
      await token.transfer(contributor, oneEth, { from: owner })
      await token.approve(pool.address, oneEth, { from: contributor })
      await pool.contribute(0, oneEth, { from: contributor })
      const contributedToken2Amount = await pool.contributorToken2Amount(
        contributor
      )

      expect(contributedToken2Amount).to.be.bignumber.eq(oneEth)

      const auctionIndex = await dutchX.getAuctionIndex.call(
        weth.address,
        token.address
      )

      expect(auctionIndex).to.be.bignumber.eq('0')
    })

    it('should not be able to contribute after start', async () => {
      await weth.deposit({ from: contributor, value: oneHundredEth })
      await weth.approve(pool.address, oneHundredEth, { from: contributor })

      await token.transfer(contributor, oneHundredEth, { from: owner })
      await token.approve(pool.address, oneHundredEth, { from: contributor })
      // first contribution meets the requirements
      await pool.contribute(oneHundredEth, oneHundredEth, {
        from: contributor,
      })

      await weth.deposit({ from: contributor, value: oneEth })
      await weth.approve(pool.address, oneEth, { from: contributor })
      shouldFail.reverting(pool.contribute(oneEth, 0, { from: contributor }))
    })
  })

  describe('#withdraw', () => {
    beforeEach(async () => {
      await pool.contribute(0, 0, {
        from: contributor,
        value: oneEth,
      })
    })

    it('should withdraw eth token from contract', async () => {
      const contributorBalanceBefore = await balance.current(contributor)
      const receipt = await pool.withdraw({ from: contributor })
      const contributorBalanceAfter = await balance.current(contributor)

      const tx = await web3.eth.getTransaction(receipt.tx)
      const gasUsed = new BN(receipt.receipt.gasUsed)
      const gasPrice = new BN(tx.gasPrice)
      const gasCosts = gasUsed.mul(gasPrice)

      const contributedToken1Amount = await pool.contributorToken1Amount(
        contributor
      )

      expect(contributedToken1Amount).to.be.bignumber.eq('0')

      const contributedToken2Amount = await pool.contributorToken2Amount(
        contributor
      )

      expect(contributedToken2Amount).to.be.bignumber.eq('0')
      expect(contributorBalanceBefore.sub(gasCosts)).to.be.bignumber.eq(
        contributorBalanceAfter.sub(oneEth)
      )
    })

    it('should withdraw weth from contract', async () => {
      await weth.deposit({ from: contributor, value: oneEth })
      await weth.approve(pool.address, oneEth, { from: contributor })
      await pool.contribute(oneEth, 0, { from: contributor })
      const contributorBalanceBefore = await weth.balanceOf(contributor)
      await pool.withdraw({ from: contributor })
      const contributorBalanceAfter = await weth.balanceOf(contributor)

      const contributedToken1Amount = await pool.contributorToken1Amount(
        contributor
      )

      expect(contributedToken1Amount).to.be.bignumber.eq('0')

      const contributedToken2Amount = await pool.contributorToken2Amount(
        contributor
      )
      expect(contributedToken2Amount).to.be.bignumber.eq('0')
      expect(contributorBalanceBefore.add(oneEth)).to.be.bignumber.eq(
        contributorBalanceAfter
      )
    })

    it('should withdraw token2 from contract', async () => {
      await token.transfer(contributor, oneEth, { from: owner })
      await token.approve(pool.address, oneEth, { from: contributor })
      await pool.contribute(0, oneEth, { from: contributor })
      await pool.withdraw({ from: contributor })
      const contributorBalanceAfter = await token.balanceOf(contributor)

      const contributedToken1Amount = await pool.contributorToken1Amount(
        contributor
      )

      expect(contributedToken1Amount).to.be.bignumber.eq('0')

      const contributedToken2Amount = await pool.contributorToken2Amount(
        contributor
      )
      expect(contributedToken2Amount).to.be.bignumber.eq('0')
      expect(oneEth).to.be.bignumber.eq(contributorBalanceAfter)
    })

    it('should not be able to withdraw when token is added to dx', async () => {
      await weth.deposit({ from: contributor, value: oneHundredEth })
      await weth.approve(pool.address, oneHundredEth, { from: contributor })

      await token.transfer(contributor, oneHundredEth, { from: owner })
      await token.approve(pool.address, oneHundredEth, { from: contributor })

      await pool.contribute(oneHundredEth, oneHundredEth, {
        from: contributor,
      })

      shouldFail.reverting(pool.withdraw({ from: contributor }))
    })
  })

  describe('#collectFunds', () => {
    beforeEach(async () => {
      await token.approve(pool.address, oneHundredEth, { from: owner })

      await pool.contribute(0, oneHundredEth, {
        from: owner,
        value: oneHundredEth,
      })
    })

    it('should not work before Auction starts', async () => {
      shouldFail.reverting(pool.collectFunds())
    })

    it('should not work when funds are already collected', async () => {
      const auctionStart = (await dutchX.getAuctionStart.call(
        weth.address,
        token.address
      )).toNumber()

      await time.increaseTo(auctionStart + duration.hours(14))
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

      let poolBalance = await token.balanceOf(pool.address)
      expect(poolBalance).to.be.bignumber.eq(ether('100')) // token2Balance still in pool

      await time.increaseTo(auctionStart + duration.hours(15))
      await pool.collectFunds()

      poolBalance = await token.balanceOf(pool.address)

      assert(poolBalance.gt(0))
    })
  })

  describe('#claimFunds', () => {
    beforeEach(async () => {
      await token.transfer(contributor, oneHundredEth, { from: owner })
      await token.approve(pool.address, oneHundredEth, { from: contributor })

      await pool.contribute(0, oneHundredEth, {
        from: contributor,
        value: oneHundredEth,
      })

      const auctionStart = (await dutchX.getAuctionStart.call(
        weth.address,
        token.address
      )).toNumber()

      await time.increaseTo(auctionStart + duration.hours(14))
      await time.increaseTo(auctionStart + duration.hours(15))
    })

    it('should not work when funds are NOT collected', async () => {
      shouldFail.reverting(pool.claimFunds())
    })

    it('should not be possible to claim second time', async () => {
      await pool.collectFunds({ from: contributor })

      let contributorBalance = await token.balanceOf(contributor)
      expect(contributorBalance).to.be.bignumber.eq('0')

      await pool.claimFunds({ from: contributor })
      shouldFail.reverting(pool.claimFunds())

      contributorBalance = await token.balanceOf(contributor)
      assert(contributorBalance.gt(0))
    })

    it('should claim funds', async () => {
      await pool.collectFunds({ from: contributor })

      let contributorBalance = await token.balanceOf(contributor)
      expect(contributorBalance).to.be.bignumber.eq('0')

      await pool.claimFunds({ from: contributor })
      contributorBalance = await token.balanceOf(contributor)
      assert(contributorBalance.gt(0))
    })
  })
})
