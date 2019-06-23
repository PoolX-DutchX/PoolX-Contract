const Pool = artifacts.require('./Pool.sol')
const Token = artifacts.require('./TokenGNO.sol')
const EtherToken = artifacts.require('./EtherToken.sol')
const DutchExchangeProxy = artifacts.require('./DutchExchangeProxy.sol')
const DutchExchange = artifacts.require('./DutchExchange.sol')

const { duration } = require('./helpers/timer')
const { ensuresException } = require('./helpers/exception')
const { BN, ether, time } = require('openzeppelin-test-helpers')

const { expect } = require('chai')

contract('Pool', ([owner, contributor]) => {
  let pool, token, weth, dx, dutchX
  const initialClosingPriceNum = 2
  const initialClosingPriceDen = 1
  const oneEth = ether('1')
  const twentyEth = ether('20')
  const fortyTokens = ether('40')
  const refundedTokens = new BN('1818181818181818180')

  async function listToken() {
    // weth sell side
    await weth.deposit({ from: contributor, value: twentyEth })
    await weth.approve(pool.address, twentyEth, { from: contributor })

    // token buy side
    await token.transfer(contributor, fortyTokens, { from: owner })
    await token.approve(pool.address, fortyTokens, { from: contributor })

    await pool.contribute(twentyEth, fortyTokens, {
      from: contributor,
    })
  }

  async function contributeEth() {
    await weth.deposit({ from: contributor, value: oneEth })
    await weth.approve(pool.address, oneEth, { from: contributor })
    await pool.contribute(oneEth, 0, { from: contributor })
  }

  async function buyAndCollect() {
    const auctionStart = await dutchX.getAuctionStart.call(
      weth.address,
      token.address
    )

    const latestTime = await time.latest()
    if (auctionStart.gt(latestTime)) await time.increaseTo(auctionStart)

    await pool.buyAndCollect()
  }

  beforeEach(async () => {
    token = await Token.new(ether('1000'))
    weth = await EtherToken.deployed()
    dx = await DutchExchangeProxy.deployed()
    dutchX = await DutchExchange.at(dx.address)

    pool = await Pool.new()
    await pool.init(
      dx.address,
      weth.address,
      token.address,
      initialClosingPriceNum,
      initialClosingPriceDen,
      'Pool name',
      'Pool description'
    )
  })

  describe('#contribute', () => {
    it('should deposit weth token in the contract', async () => {
      await contributeEth()
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

    it('should be able to list the token', async () => {
      await listToken()

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
      await listToken()

      await weth.deposit({ from: contributor, value: oneEth })
      await weth.approve(pool.address, oneEth, { from: contributor })

      try {
        await pool.contribute(oneEth, 0, { from: contributor })
        assert.fail()
      } catch (e) {
        ensuresException(e)
      }
    })

    it('should be possible to withdraw the contribution', async () => {
      const wethBalanceInitial = await weth.balanceOf(contributor)
      await contributeEth()
      const contributedAmount = await pool.contributorToken1Amount(contributor)
      await pool.withdrawContribution({ from: contributor })
      const wethBalanceAfterWithdraw = await weth.balanceOf(contributor)

      expect(
        wethBalanceAfterWithdraw.sub(wethBalanceInitial)
      ).to.be.bignumber.eq(contributedAmount)
    })
  })

  describe('#buyAndCollect', () => {
    it('should not work before auction starts', async () => {
      try {
        await listToken()
        await pool.buyAndCollect()
        assert.fail()
      } catch (e) {
        ensuresException(e)
      }
    })

    it('should not work when funds are already collected', async () => {
      await listToken()

      const auctionStart = (await dutchX.getAuctionStart.call(
        weth.address,
        token.address
      )).toNumber()

      await time.increaseTo(auctionStart + duration.hours(1))

      await pool.buyAndCollect()

      try {
        await pool.buyAndCollect()
        assert.fail()
      } catch (e) {
        ensuresException(e)
      }
    })

    it('should work immediately at auction start', async () => {
      await listToken()
      const auctionStart = (await dutchX.getAuctionStart.call(
        weth.address,
        token.address
      )).toNumber()

      await time.increaseTo(auctionStart)

      let auctionIndex = await dutchX.getAuctionIndex.call(
        weth.address,
        token.address
      )
      expect(auctionIndex).to.be.bignumber.eq('1') // still in first auction

      const poolBalanceBefore = await token.balanceOf(pool.address)
      await pool.buyAndCollect()

      auctionIndex = await dutchX.getAuctionIndex.call(
        weth.address,
        token.address
      )
      expect(auctionIndex).to.be.bignumber.eq('2') // first auction is finished. Index incremented.

      const poolBalanceAfter = await token.balanceOf(pool.address)
      expect(poolBalanceAfter).to.be.bignumber.eq(poolBalanceBefore) // token2Balance or buyside funds are back in the pool
    })

    it('should be possible to collect funds', async () => {
      await listToken()

      const auctionStart = (await dutchX.getAuctionStart.call(
        weth.address,
        token.address
      )).toNumber()

      await time.increaseTo(auctionStart + duration.hours(1))

      let auctionIndex = await dutchX.getAuctionIndex.call(
        weth.address,
        token.address
      )
      expect(auctionIndex).to.be.bignumber.eq('1') // still in first auction

      const poolBalanceBefore = await token.balanceOf(pool.address)

      await pool.buyAndCollect()

      auctionIndex = await dutchX.getAuctionIndex.call(
        weth.address,
        token.address
      )
      expect(auctionIndex).to.be.bignumber.eq('2') // first auction is finished. Index incremented.

      const poolBalanceAfter = await token.balanceOf(pool.address)
      expect(poolBalanceAfter).to.be.bignumber.eq(poolBalanceBefore) // token2Balance or buyside funds are back in the pool
    })
  })

  describe('#claimFunds', () => {
    beforeEach(async () => {
      await listToken()

      const auctionStart = (await dutchX.getAuctionStart.call(
        weth.address,
        token.address
      )).toNumber()

      await time.increaseTo(auctionStart + duration.hours(10))
    })

    it('should claim funds', async () => {
      await buyAndCollect()

      let contributorBalance = await token.balanceOf(contributor)
      expect(contributorBalance).to.be.bignumber.eq(refundedTokens)

      await pool.claimFunds({ from: contributor })
      contributorBalance = await token.balanceOf(contributor)
      assert(contributorBalance.gt(refundedTokens))
    })

    it('should not work when funds are NOT collected', async () => {
      try {
        await pool.claimFunds()
        assert.fail()
      } catch (e) {
        ensuresException(e)
      }
    })

    it('should not be possible to claim second time', async () => {
      await buyAndCollect()

      await pool.claimFunds({ from: contributor })

      try {
        await pool.claimFunds()
        assert.fail()
      } catch (e) {
        ensuresException(e)
      }
    })
  })
})
