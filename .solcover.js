module.exports = {
  copyPackages: ['@gnosis.pm', 'openzeppelin-solidity'],
  norpc: true,
  testCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle test --network coverage',
  compileCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle compile --network coverage',
  skipFiles: ['Migrations.sol, AppDependencies.sol, CloneFactory.sol, IEtherToken.sol, PoolXCloneFactory.sol']
}
