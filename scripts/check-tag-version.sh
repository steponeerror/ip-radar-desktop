#!/usr/bin/env bash
# CI 版本闸门:校验推送的 tag 与 src-tauri/tauri.conf.json 的 version 一致。
# 背景:tag v0.1.10-beta.1 曾打出 IP.Radar.Desktop_0.1.9_aarch64.dmg — DMG 资产名
# 取自 tauri.conf.json 的 version,漏 bump 时资产名与 tag 错配。此处让它直接 fail。
# 用法: check-tag-version.sh <tag>   (exit 0 = 放行, exit 1 = tag 与版本不一致)
set -euo pipefail

tag="${1:?用法: check-tag-version.sh <tag>}"
conf_version="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("src-tauri/tauri.conf.json","utf8")).version)')"

# 剥离前导 v 后做全等字符串比较
tag_stripped="${tag#v}"

if [ "$tag_stripped" != "$conf_version" ]; then
  echo "版本不一致: tag=${tag_stripped} conf=${conf_version}" >&2
  echo "tag ${tag} 与 src-tauri/tauri.conf.json version ${conf_version} 不匹配 — 请 bump version 后重新打 tag。" >&2
  exit 1
fi

echo "版本一致: tag=${tag_stripped} conf=${conf_version}"
