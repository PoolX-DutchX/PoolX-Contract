#!/usr/bin/env bash

rm -rf flats/*

./node_modules/.bin/truffle-flattener contracts/Pool.sol > flats/Pool.sol
