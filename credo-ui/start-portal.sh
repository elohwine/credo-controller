#!/bin/bash
cd "$(dirname "$0")/portal"
PORT=5000 NEXT_PUBLIC_VC_REPO="http://localhost:3000" yarn dev