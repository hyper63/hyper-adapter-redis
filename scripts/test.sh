#!/usr/bin/env bash

deno lint && deno fmt --check && deno test -A --no-lock --unstable adapter_test.js mod_test.js
