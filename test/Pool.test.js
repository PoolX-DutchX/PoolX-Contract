const Pool = artifacts.require('Pool')
const Token = artifacts.require('TokenGNO')
const EtherToken = artifacts.require('EtherToken')
const DutchExchangeProxy = artifacts.require('DutchExchangeProxy')
const DutchExchange = artifacts.require('DutchExchange')

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

  async function contributeWethAndToken(_contributor, wethAmount, tokenAmount) {
    const wethInWei = ether(wethAmount)
    const tokenInWei = ether(tokenAmount)
    await weth.deposit({ from: _contributor, value: wethInWei })
    await weth.approve(pool.address, wethInWei, { from: _contributor })
    await token.transfer(_contributor, tokenInWei, { from: owner })
    await token.approve(pool.address, tokenInWei, { from: _contributor })
    await pool.contribute(wethInWei, tokenInWei, { from: _contributor })
  }

  async function getAuctionStart() {
    const auctionStart = await dutchX.getAuctionStart.call(
      weth.address,
      token.address
    )
    return auctionStart.toNumber()
  }

  async function getAuctionIndex() {
    return await dutchX.getAuctionIndex.call(weth.address, token.address)
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

      const auctionIndex = await getAuctionIndex()
      expect(auctionIndex).to.be.bignumber.eq('0')
    })

    it('should be able to list the token', async () => {
      await listToken()
      // no more ether in pool contract
      const poolBalance = await web3.eth.getBalance(pool.address)
      expect(poolBalance).to.be.eq('0')

      const auctionListedIndex = await getAuctionIndex()
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

      const auctionIndex = await getAuctionIndex()
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
      const tokenBalanceInitial = await token.balanceOf(contributor)
      await contributeWethAndToken(contributor, '1', '2')
      const contributedWethAmount = await pool.contributorToken1Amount(
        contributor
      )
      const contributedTokenAmount = await pool.contributorToken2Amount(
        contributor
      )
      await pool.withdrawContribution({ from: contributor })
      const wethBalanceAfterWithdraw = await weth.balanceOf(contributor)
      const tokenBalanceAfterWithdraw = await token.balanceOf(contributor)
      expect(
        wethBalanceAfterWithdraw.sub(wethBalanceInitial)
      ).to.be.bignumber.eq(contributedWethAmount)
      expect(
        tokenBalanceAfterWithdraw.sub(tokenBalanceInitial)
      ).to.be.bignumber.eq(contributedTokenAmount)
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
      const auctionStart = await getAuctionStart()
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
      const auctionStart = await getAuctionStart()
      await time.increaseTo(auctionStart)
      let auctionIndex = await getAuctionIndex()
      expect(auctionIndex).to.be.bignumber.eq('1') // still in first auction

      const poolBalanceBefore = await token.balanceOf(pool.address)
      await pool.buyAndCollect()
      auctionIndex = await getAuctionIndex()
      expect(auctionIndex).to.be.bignumber.eq('2') // first auction is finished. Index incremented.

      const poolBalanceAfter = await token.balanceOf(pool.address)
      expect(poolBalanceAfter).to.be.bignumber.eq(poolBalanceBefore) // token2Balance or buyside funds are back in the pool
    })

    it('should be possible to collect funds', async () => {
      await listToken()
      const auctionStart = await getAuctionStart()
      await time.increaseTo(auctionStart + duration.hours(1))
      let auctionIndex = await getAuctionIndex()
      expect(auctionIndex).to.be.bignumber.eq('1') // still in first auction

      const poolBalanceBefore = await token.balanceOf(pool.address)
      await pool.buyAndCollect()
      auctionIndex = await getAuctionIndex()
      expect(auctionIndex).to.be.bignumber.eq('2') // first auction is finished. Index incremented.

      const poolBalanceAfter = await token.balanceOf(pool.address)
      expect(poolBalanceAfter).to.be.bignumber.eq(poolBalanceBefore) // token2Balance or buyside funds are back in the pool
    })
  })

  describe('#claimFunds', () => {
    beforeEach(async () => {
      await listToken()
      const auctionStart = await getAuctionStart()
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

  it('received tokens should match conversion', async () => {
    const contributor1WethTransfer = '10'
    const contributor2TokenTransfer = '40'
    const refundedTokens1 = '909090909090909090'
    const refundedTokens2 = '1818181818181818180'
    let contributor1WethBalance, contributor1TokenBalance,
      contributor2WethBalance, contributor2TokenBalance

    await contributeWethAndToken(contributor, contributor1WethTransfer, '0')
    await contributeWethAndToken(contributor2, '0', contributor2TokenTransfer)
    contributor1WethBalance = await weth.balanceOf(contributor)
    expect(contributor1WethBalance).to.be.bignumber.eq(refundedTokens1)
    contributor2TokenBalance = await token.balanceOf(contributor2)
    expect(contributor2TokenBalance).to.be.bignumber.eq(refundedTokens2)

    const auctionStart = await getAuctionStart()
    await time.increaseTo(auctionStart + duration.hours(12))
    await pool.buyAndCollect({ from: owner })

    await time.increaseTo(auctionStart + duration.hours(25))
    await pool.claimFunds({ from: contributor })
    await pool.claimFunds({ from: contributor2 })

    const closingPrice = await dutchX.closingPrices(
      weth.address,
      token.address,
      1
    )
    const numerator = closingPrice.num
    const denominator = closingPrice.den

    contributor1WethBalance = await weth.balanceOf(contributor)
    contributor1TokenBalance = await token.balanceOf(contributor)

    const usedSellToken = ether(contributor1WethTransfer).sub(
      contributor1WethBalance
    )
    const buyTokenFromSellToken = usedSellToken.mul(numerator).div(denominator)
    const dxWethBalance = await weth.balanceOf(dutchX.address)
    expect(buyTokenFromSellToken.sub(dxWethBalance)).to.be.bignumber.closeTo(
      contributor1TokenBalance,
      new BN('10000000000000')
    )

    contributor2WethBalance = await weth.balanceOf(contributor2)
    contributor2TokenBalance = await token.balanceOf(contributor2)

    const usedBuyToken = ether(contributor2TokenTransfer).sub(
      contributor2TokenBalance
    )
    const sellTokenFromBuyToken = usedBuyToken.mul(denominator).div(numerator)
    expect(sellTokenFromBuyToken).to.be.bignumber.eq(contributor2WethBalance)
  })
})
