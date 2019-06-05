#!/usr/bin/env bash

rm -rf flats/*

truffle-flattener contracts/Pool.sol > flats/Pool.sol
truffle-flattener contracts/PoolXCloneFactory.sol > flats/PoolXCloneFactory.sol
