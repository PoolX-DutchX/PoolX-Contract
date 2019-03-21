const Pool = artifacts.require('./Pool.sol')
const Token = artifacts.require('./TokenGNO.sol')
const EtherToken = artifacts.require('./EtherToken.sol')
const DutchExchangeProxy = artifacts.require('./DutchExchangeProxy.sol')
const DutchExchange = artifacts.require('./DutchExchange.sol')
const PoolXCloneFactory = artifacts.require('./PoolXCloneFactory.sol')

const { duration } = require('./helpers/timer')
const { BN, balance, constants, expectEvent, shouldFail, ether, should, time } = require('openzeppelin-test-helpers');


contract('Pool', ([owner, contributor1, contributor2]) => {
    let pool, clonedPool, poolCloneFactory, token, weth, dx, dutchX
    const initialClosingPriceNum = 2
    const initialClosingPriceDen = 1
    const oneEth = ether('1');
    const oneHundredEth = ether('100');
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
      await pool.contribute(0, 0, { from: contributor1, value: oneEth })
      const contributedAmountToken1 = await pool.contributorAmountToken1(contributor1)
      const poolBalance = await balance.current(pool.address)
      contributedAmountToken1.should.be.bignumber.eq(oneEth)
      poolBalance.should.be.bignumber.eq(oneEth)
    })

    it('should deposit weth token in the contract', async () => {

        await weth.deposit({ from: contributor1, value: oneEth })
        await weth.approve(pool.address, oneEth, { from: contributor1 })
        await pool.contribute(oneEth, 0, { from: contributor1})
        const contributedAmountToken1 = await pool.contributorAmountToken1(contributor1)
        contributedAmountToken1.should.be.bignumber.eq(oneEth)
        const auctionIndex = await dutchX.getAuctionIndex.call(weth.address, token.address)
        auctionIndex.should.be.bignumber.eq("0")
     })

    it('should update the pool funds in USD ', async () => {
      await pool.contribute(0, 0, { from: contributor1, value: oneEth })

      const poolBalanceInUsd = await pool.getEthInUsd()

      poolBalanceInUsd.should.be.bignumber.eq("1100")
    })

    it('should be able to list the token', async () => {
        await weth.deposit({ from: contributor1, value: oneHundredEth })

        await weth.approve(pool.address, oneHundredEth,{ from: contributor1})
        await pool.contribute(oneHundredEth,0,{ from: contributor1 })

      // no more ether in pool contract
      const poolBalance = await web3.eth.getBalance(pool.address)
      poolBalance.should.be.eq("0")

      const auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      )
      // proves that token was listed. Shows that in the dutchX exchange the first auction for the token pair exists
      auctionListedIndex.should.be.bignumber.eq("1")
    })
  })

  describe('#withdraw', () => {
    beforeEach(async () => {
        await pool.contribute(0, 0, {
          from: contributor1,
          value: oneEth,
        })
      })
      it('should withdraw weth token from contract', async () => {
        const contributor1BalanceBefore = await balance.current(contributor1)
        const receipt = await pool.withdraw({ from: contributor1 })
        const contributor1BalanceAfter = await balance.current(contributor1)

        const tx = await web3.eth.getTransaction(receipt.tx)
        const gasUsed = new BN(receipt.receipt.gasUsed)
        const gasPrice = new BN(tx.gasPrice)
        const gasCosts = gasUsed.mul(gasPrice)


        const contributedAmountToken1 = await pool.contributorAmountToken1(contributor1)
        contributedAmountToken1.should.be.bignumber.eq("0")
        const contributedAmountToken2 = await pool.contributorAmountToken2(contributor1)
        contributedAmountToken2.should.be.bignumber.eq("0")
        
        contributor1BalanceBefore.sub(gasCosts).should.be.bignumber.eq(contributor1BalanceAfter)


     })
  })

  describe('#collectFunds', () => {
    beforeEach(async () => {
  
      await pool.contribute(0, 0, {
        from: owner,
        value: oneHundredEth,
      })
    })

    it('should be able to list the token', async () => {

  
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


      // // eslint-disable-next-line
      const postBuyOrder = await dutchX.postBuyOrder(
        weth.address,
        token.address,
        auctionListedIndex,
        oneHundredEth
      )


      let ownerBalance = await token.balanceOf(owner)
      ownerBalance.should.be.bignumber.eq("0")
      await time.increaseTo(auctionStart + duration.hours(15))
      const balance1 =  await dutchX.balances(weth.address, pool.address)
      const balance2 =  await dutchX.balances(weth.address, pool.address)

      await pool.collectFunds()


      poolBalance = await token.balanceOf(pool.address)
      auctionListedIndex = await dutchX.getAuctionIndex(
        weth.address,
        token.address
      )

      await pool.claimFunds()
      ownerBalance = await token.balanceOf(owner)
 
      ownerBalance = await token.balanceOf(pool.address)

    })
  })

  describe('#claimFunds', () => {})
})
