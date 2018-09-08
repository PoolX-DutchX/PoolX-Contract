#!/usr/bin/env bash

rm -rf flats/*

truffle-flattener contracts/Pool.sol > flats/Pool.sol
