/* global artifacts */
/* eslint no-undef: "error" */

const ETH_TEST_AMOUNT = 1e18;

const Pool = artifacts.require("Pool");
const DutchExchangeProxy = artifacts.require("DutchExchangeProxy");
const EtherToken = artifacts.require("EtherToken");
const StandardToken = artifacts.require("StandardToken");
let dutchExchangeProxy;
let etherToken;
let token;

module.exports = function(deployer, network, accounts) {
  const account = accounts[0];
  
  let deployerPromise = deployer
    // Make sure DutchX is deployed
    .then(() => DutchExchangeProxy.deployed())

    // Deploy contracts
    .then(_dutchExchangeProxy => {
      dutchExchangeProxy = _dutchExchangeProxy
      return EtherToken.deployed();
    })
    .then(_etherToken => {
      etherToken = _etherToken;
      
      return StandardToken.new();
    })
    .then(_token => {
      token = _token;

      return deployer.deploy(Pool, dutchExchangeProxy.address, etherToken.address, _token.address, 1, 1);
    })

  if (network === "development") {
    // const EtherToken = artifacts.require("EtherToken");

    deployerPromise = deployerPromise
      // .then(() => EtherToken.deployed())
      // // Wrap 1 ETH for testing
      // .then(weth => {
      //   console.log(
      //     "Wrap %d ETH into WETH for account %s",
      //     ETH_TEST_AMOUNT / 1e18,
      //     account
      //   );
      //   return weth.deposit({ value: ETH_TEST_AMOUNT });
      // })

      
      .then(() => Pool.deployed())
      // .then(pool => {
        
      //   console.log('====================================');
      //   console.log(pool);
      //   console.log('====================================');
      
      //   return pool.deposit({from: accounts[0],value: ETH_TEST_AMOUNT});
      // })

      // Deposit the WETH into the safe
      // .then(() => Safe.deployed())
      // .then(safe => {
      //   console.log(
      //     "Deposit %d WETH (%s) into the safe %s",
      //     ETH_TEST_AMOUNT / 1e18,
      //     EtherToken.address,
      //     Safe.address
      //   );
      //   return safe.deposit(EtherToken.address, ETH_TEST_AMOUNT);
      // });
  }

  return deployerPromise;
};
