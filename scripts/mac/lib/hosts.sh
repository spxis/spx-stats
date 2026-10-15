# The one loader for the PRIVATE host mapping. Source it; works in bash 3.2 and zsh. It prints nothing when sourced.
#
# Why: this repository is public. It names machines and networks only by role:
#   machine1  the main desktop Mac (on the home network all day)
#   machine2  the laptop Mac (reaches the NAS over the VPN)
#   nas1      the always-on NAS that hosts the source database (called DS1 in code, docs and keychain item names)
#   nas2      a second NAS with no spx database (nothing here ever talks to it)
# What each role really is (addresses, host names, the NAS login, folders) lives in ONE private file outside the repo:
#   $SPX_HOSTS_CONFIG, default ~/.config/spx-stats/hosts.env (directory 700, file 600, never committed).
# Create it with: zsh scripts/mac/spx-credentials.sh hosts   (the values are in the private START-HERE file).
#
# File format: NAME=value lines, `#` comment lines, optional double or single quotes around the value, no inline comments.
# Only the names listed below are read; anything else in the file is ignored. A variable that is already set in the environment
# wins over the file (that is how the cloud session gets its values, and how a test swaps them).
#
#   NAS1_LAN_HOSTS        space-separated addresses or names tried on the home network, in order (the first that answers wins)
#   NAS1_LAN_PRIMARY      the one LAN address the hosts-file name and the ssh config use
#   NAS1_VPN_HOST         the address of nas1 over the VPN
#   NAS1_SSH_ALIAS        the hosts-file and ssh name for nas1 (default ds1: Macs set up earlier already use it)
#   NAS1_SSH_USER         the login on nas1 for ssh
#   NAS1_DB_PORT          the database port on nas1 (default 55440; it is also in the keychain item names)
#   NAS1_DOCKER_DIR       the folder on nas1 that holds the job folders (spx-daily-scores, spx-release-runner, spx-harvest)
#   NAS1_DOCKER_BIN       the docker command on nas1 (default docker; a NAS may need a full path)
#   NAS2_LAN_HOST         optional: nas2's address. No script uses it; it is there so the repository guard can refuse it in a file
#   MACHINE1_LOCALNAME    machine1's macOS LocalHostName (how a script knows which Mac it is on)
#   MACHINE2_LOCALNAME    the same for machine2
#   MACHINE1_HOST         machine1's network name for ssh from the other Mac (e.g. <LocalHostName>.local)
#   MACHINE2_HOST         the same for machine2
#   MACHINE1_SSH_ALIAS    the ssh alias machine2 uses for machine1 (default machine1; an older Mac may already use another)
#   MACHINE2_SSH_ALIAS    the ssh alias machine1 uses for machine2 (default machine2)
#   MACHINE_SSH_USER      the macOS login used for ssh between the two Macs
#   HOSTS_GUARD_WORDS     optional, space-separated extra words scripts/check_private_hosts.sh must never find in a committed file
#
# Functions:
#   spx_hosts_load            read the file (called once when this is sourced); sets SPX_MAP_FILE and SPX_HOSTS_LOADED=1|0
#   spx_hosts_need NAME...    return 0 when every NAME is set; else print ONE "MISSING: ..." line to stderr and return 1
#   spx_hosts_fix             the one fix, as text: how to create the file

SPX_MAP_FILE="${SPX_HOSTS_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/spx-stats/hosts.env}"

spx_hosts_fix() {
  printf 'zsh scripts/mac/spx-credentials.sh hosts [--from <the private START-HERE file>]'
}

spx_hosts_load() {
  local line k v
  SPX_HOSTS_LOADED=0
  if [ -r "$SPX_MAP_FILE" ]; then
    SPX_HOSTS_LOADED=1
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in ''|'#'*|' '*) continue ;; esac
      line="${line#export }"
      case "$line" in *=*) ;; *) continue ;; esac
      k="${line%%=*}"; v="${line#*=}"
      case "$k" in
        NAS1_*|NAS2_*|MACHINE1_*|MACHINE2_*|MACHINE_*|HOSTS_*) ;;
        *) continue ;;
      esac
      case "$k" in *[!A-Z0-9_]*) continue ;; esac
      case "$v" in
        \"*\") v="${v#\"}"; v="${v%\"}" ;;
        \'*\') v="${v#\'}"; v="${v%\'}" ;;
      esac
      # the environment wins: only fill a name that is not set at all
      if eval "[ -z \"\${$k+x}\" ]"; then export "$k=$v"; fi
    done < "$SPX_MAP_FILE"
  fi
  : "${NAS1_SSH_ALIAS:=ds1}" "${NAS1_DB_PORT:=55440}" "${NAS1_DOCKER_BIN:=docker}"
  : "${MACHINE1_SSH_ALIAS:=machine1}" "${MACHINE2_SSH_ALIAS:=machine2}"
  export NAS1_SSH_ALIAS NAS1_DB_PORT NAS1_DOCKER_BIN MACHINE1_SSH_ALIAS MACHINE2_SSH_ALIAS
}

# spx_hosts_need NAME...: every NAME must be set and non-empty; otherwise one line says which and what to run.
spx_hosts_need() {
  local n miss="" v
  for n in "$@"; do
    eval "v=\"\${$n:-}\""
    [ -n "$v" ] || miss="${miss:+$miss, }$n"
  done
  [ -z "$miss" ] && return 0
  if [ "$SPX_HOSTS_LOADED" = 1 ]; then
    printf 'MISSING: %s not set in %s; add it (values: the private START-HERE file) or run: %s\n' "$miss" "$SPX_MAP_FILE" "$(spx_hosts_fix)" >&2
  else
    printf 'MISSING: the private host mapping %s does not exist (%s needed); run: %s\n' "$SPX_MAP_FILE" "$miss" "$(spx_hosts_fix)" >&2
  fi
  return 1
}

spx_hosts_load
