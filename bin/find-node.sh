# Shared helper sourced by bin/run-server.sh and hooks/stop-check.sh.
# Resolves a usable `node` binary across standard paths and version managers
# (volta, mise, asdf, nodenv, fnm, nvm, n) in non-interactive shells on macOS & Linux.

_qr_pick_latest_node() {
  local best="" best_maj=-1 best_min=-1 best_pat=-1
  local candidate dir base ver maj min pat
  for candidate in "$@"; do
    [[ -x "$candidate" ]] || continue
    dir="$candidate"
    ver=""
    while [[ "$dir" != "/" && "$dir" != "." && -n "$dir" ]]; do
      base="${dir##*/}"
      if [[ "$base" =~ ^v?([0-9]+)\.([0-9]+)\.([0-9]+) ]]; then
        maj="${BASH_REMATCH[1]}"
        min="${BASH_REMATCH[2]}"
        pat="${BASH_REMATCH[3]}"
        ver="ok"
        break
      fi
      dir="${dir%/*}"
    done
    if [[ -z "$ver" ]]; then
      [[ -z "$best" ]] && best="$candidate"
      continue
    fi
    if (( maj > best_maj || (maj == best_maj && min > best_min) || (maj == best_maj && min == best_min && pat > best_pat) )); then
      best="$candidate"
      best_maj=$maj
      best_min=$min
      best_pat=$pat
    fi
  done
  printf '%s' "$best"
}

_qr_find_nvm_node() {
  local nvm_dir="$1"
  [[ -d "$nvm_dir/versions/node" ]] || return 1

  local alias_val="" target="" resolved=""
  if [[ -r "$nvm_dir/alias/default" ]]; then
    alias_val="$(tr -d '[:space:]' < "$nvm_dir/alias/default" 2>/dev/null || true)"
    # Follow one level of named alias (e.g. lts/* -> lts/jod -> v22.x)
    local hops=0
    while [[ -n "$alias_val" && "$hops" -lt 4 && -r "$nvm_dir/alias/$alias_val" ]]; do
      alias_val="$(tr -d '[:space:]' < "$nvm_dir/alias/$alias_val" 2>/dev/null || true)"
      hops=$((hops + 1))
    done
    if [[ -n "$alias_val" && "$alias_val" =~ ^v?[0-9] ]]; then
      target="${alias_val#v}"
      resolved="$(_qr_pick_latest_node "$nvm_dir/versions/node/v${target}"*/bin/node)"
      if [[ -x "$resolved" ]]; then
        printf '%s' "$resolved"
        return 0
      fi
    fi
  fi

  resolved="$(_qr_pick_latest_node "$nvm_dir"/versions/node/*/bin/node)"
  if [[ -x "$resolved" ]]; then
    printf '%s' "$resolved"
    return 0
  fi
  return 1
}

find_node_bin() {
  local home_dir="${HOME:-}"
  local existing=""
  existing="$(command -v node 2>/dev/null || true)"
  if [[ -n "$existing" && -x "$existing" && "$existing" != "/usr/bin/node" && "$existing" != "/bin/node" ]]; then
    printf '%s' "$existing"
    return 0
  fi

  local candidates=(
    "${VOLTA_HOME:-${home_dir}/.volta}/bin/node"
    "${home_dir}/.local/share/mise/shims/node"
    "${home_dir}/.mise/shims/node"
    "${ASDF_DATA_DIR:-${home_dir}/.asdf}/shims/node"
    "${home_dir}/.nodenv/shims/node"
    "${FNM_DIR:-${home_dir}/.local/share/fnm}/aliases/default/bin/node"
    "${home_dir}/.fnm/aliases/default/bin/node"
    "${home_dir}/.fnm/current/bin/node"
    "${home_dir}/.n/bin/node"
    "${home_dir}/.local/bin/node"
    "/opt/homebrew/bin/node"
    "/usr/local/bin/node"
  )

  local c
  for c in "${candidates[@]}"; do
    if [[ -x "$c" ]]; then
      printf '%s' "$c"
      return 0
    fi
  done

  local nvm_dir resolved
  for nvm_dir in "${NVM_DIR:-${home_dir}/.nvm}" "/usr/local/share/nvm"; do
    if resolved="$(_qr_find_nvm_node "$nvm_dir")" && [[ -x "$resolved" ]]; then
      printf '%s' "$resolved"
      return 0
    fi
  done

  resolved="$(_qr_pick_latest_node \
    "${FNM_DIR:-${home_dir}/.local/share/fnm}"/node-versions/*/installation/bin/node \
    "${home_dir}/.fnm"/node-versions/*/installation/bin/node \
    "${home_dir}/.local/share/mise"/installs/node/*/bin/node \
    "/usr/local/n/versions/node"/*/bin/node)"
  if [[ -x "$resolved" ]]; then
    printf '%s' "$resolved"
    return 0
  fi

  for c in "/usr/bin/node" "/bin/node" "$existing"; do
    if [[ -n "$c" && -x "$c" ]]; then
      printf '%s' "$c"
      return 0
    fi
  done

  return 1
}
