const HDWalletProvider = require('truffle-hdwallet-provider')
const ProviderEngine = require('web3-provider-engine')
const RpcProvider = require('web3-provider-engine/subproviders/rpc.js')
const { TruffleArtifactAdapter } = require('@0x/sol-trace')
const { GanacheSubprovider } = require('@0x/subproviders')
const { ProfilerSubprovider } = require('@0x/sol-profiler')
const { CoverageSubprovider } = require('@0x/sol-coverage')
const { RevertTraceSubprovider } = require('@0x/sol-trace')

const solcVersion = '0.5.10'
const isVerbose = true
const urlDevelopment = 'http://localhost'
const portDevelopment = 8545
const urlRinkeby = 'https://rinkeby.infura.io/'
const urlMainnet = 'https://mainnet.infura.io'
const DEFAULT_GAS_PRICE_GWEI = 5
const gasPrice = DEFAULT_GAS_PRICE_GWEI * 1e9
const GAS_LIMIT = 6.5e6
const DEFAULT_MNEMONIC =
  'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat'

const _getProvider = url => {
  if (url === urlDevelopment) {
    return _configureProviderEngine()
  } else {
    return () => new HDWalletProvider(DEFAULT_MNEMONIC, url)
  }
}

function _configureProviderEngine() {
  const providerEngine = new ProviderEngine()
  const mode = process.env.MODE
  if (mode) {
    // 0x tools in use
    const projectRoot = ''
    const artifactAdapter = new TruffleArtifactAdapter(projectRoot, solcVersion)
    const defaultFromAddress = '0x024328d80b7ed626630c87eb658b0d7002526f51'
    if (mode === 'profile') {
      global.profilerSubprovider = new ProfilerSubprovider(
        artifactAdapter,
        defaultFromAddress,
        isVerbose
      )
      global.profilerSubprovider.stop()
      providerEngine.addProvider(global.profilerSubprovider)
      providerEngine.addProvider(
        new RpcProvider({ rpcUrl: urlDevelopment + ':' + portDevelopment })
      )
    } else if (mode === 'coverage') {
      global.coverageSubprovider = new CoverageSubprovider(
        artifactAdapter,
        defaultFromAddress,
        isVerbose
      )
      providerEngine.addProvider(global.coverageSubprovider)
    } else if (mode === 'trace') {
      const revertTraceSubprovider = new RevertTraceSubprovider(
        artifactAdapter,
        defaultFromAddress,
        isVerbose
      )
      providerEngine.addProvider(revertTraceSubprovider)
    }
  }

  const ganacheSubprovider = new GanacheSubprovider()
  providerEngine.addProvider(ganacheSubprovider)
  providerEngine.start(err => {
    if (err !== undefined) {
      console.log(err)
      process.exit(1)
    }
  })
  /**
   * HACK: Truffle providers should have `send` function, while `ProviderEngine` creates providers with `sendAsync`,
   * but it can be easily fixed by assigning `sendAsync` to `send`.
   */
  providerEngine.send = providerEngine.sendAsync.bind(providerEngine)
  return providerEngine
}

module.exports = {
  networks: {
    development: {
      host: urlDevelopment,
      port: portDevelopment,
      provider: _getProvider(urlDevelopment),
      network_id: '*',
      GAS_LIMIT,
      gasPrice,
    },
    mainnet: {
      provider: _getProvider(urlMainnet),
      network_id: '1',
      GAS_LIMIT,
      gasPrice,
    },
    rinkeby: {
      provider: _getProvider(urlRinkeby),
      network_id: '4',
      GAS_LIMIT,
      gasPrice,
    },
  },
  compilers: {
    solc: {
      version: solcVersion,
      settings: {
        optimizer: {
          enabled: true,
        },
      },
    },
  },
}
