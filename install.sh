#!/usr/bin/env bash
# 鲸鱼娘生理拓展 · dsh-whale-utero 一键安装(macOS / Linux)
#
#   ./install.sh                 # 装到 desktop profile
#   PROFILE=web ./install.sh     # 装到别的 profile
#   SPEC="github:you/repo" ./install.sh
#
set -euo pipefail

PKG_NAME="dsh-whale-utero"
PROFILE="${PROFILE:-desktop}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PKG_JSON="$PROFILE_DIR/package.json"

step() { printf '\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m  [ok] %s\033[0m\n' "$1"; }
warn() { printf '\033[33m  [!!] %s\033[0m\n' "$1"; }

step "DSH 配置目录:$DSH_HOME"
step "目标 profile:$PROFILE_DIR"

if [ ! -f "$PKG_JSON" ]; then
  warn "找不到 $PKG_JSON —— 先用 DSH 启动一次 profile '$PROFILE'"
  exit 1
fi

SPEC="${SPEC:-$HERE}"

if command -v dsh >/dev/null 2>&1; then
  step "dsh plugin --profile $PROFILE add \"$SPEC\""
  if dsh plugin --profile "$PROFILE" add "$SPEC"; then
    ok '依赖已由 dsh plugin 写入 profile'
  else
    warn 'dsh plugin 执行失败,继续手动补 JSON'
  fi
else
  warn 'PATH 上没有 dsh,继续手动补 JSON'
fi

if command -v python3 >/dev/null 2>&1; then
  python3 - "$PKG_JSON" "$PKG_NAME" "$HERE" <<'PY'
import collections, json, os, sys

pkg_path, name, here = sys.argv[1], sys.argv[2], sys.argv[3]
raw = open(pkg_path, encoding='utf-8').read()
data = json.loads(raw, object_pairs_hook=collections.OrderedDict)
changed = False

deps = data.setdefault('dependencies', collections.OrderedDict())
spec = deps.get(name)
if spec is None:
    deps[name] = 'link:' + here.replace('\\', '/')
    changed = True
    print('  [ok] dependencies += %s' % name)

dsh = data.setdefault('dsh', collections.OrderedDict())
profile = dsh.setdefault('profile', collections.OrderedDict())
bundles = profile.setdefault('bundles', [])
if name not in bundles:
    bundles.append(name)
    changed = True
    print('  [ok] dsh.profile.bundles += %s' % name)

if changed:
    backup = pkg_path + '.bak-dshwhale'
    open(backup, 'w', encoding='utf-8').write(raw)
    with open(pkg_path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write('\n')
    print('  [ok] 已写入 package.json(备份:%s)' % backup)
else:
    print('  [ok] package.json 无需修改')
PY
else
  warn '没有 python3,请手动在 package.json 里加依赖与 bundles 项'
fi

cat <<'TXT'

安装完成。接下来:
  1) 重启 DSH
  2) 页面刷新后,点侧边栏的鲸鱼娘图标
TXT
