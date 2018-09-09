#!/usr/bin/env bash

rm -rf flats/*

truffle-flattener contracts/Pool.sol > flats/Pool.sol
truffle-flattener contracts/TestToken.sol > flats/TestToken.sol
