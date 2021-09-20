#!/usr/bin/env bash

deno lint && \
deno fmt --check && \./s
deno test adapter_test.js
