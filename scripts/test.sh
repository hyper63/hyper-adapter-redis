#!/usr/bin/env bash

deno lint && deno fmt --check && deno test -A --unstable adapter_test.js mod_test.js
