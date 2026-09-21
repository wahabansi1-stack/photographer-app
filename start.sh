#!/bin/bash
export PATH="$HOME/nodejs/bin:$PATH"
export PORT="${PORT:-3000}"
cd "$(dirname "$0")"
node server.js