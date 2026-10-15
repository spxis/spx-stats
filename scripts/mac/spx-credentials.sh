#!/bin/zsh
# Per-Mac credential and connection setup on John's Macs (machine1 = the main desktop Mac, machine2 = the laptop). Contains no
# values; secrets are never printed. Addresses, host names and the NAS login are NOT here: they come from the private host
# mapping ~/.config/spx-stats/hosts.env (scripts/mac/lib/hosts.sh), which the `hosts` subcommand writes.
#   spx-credentials.sh hosts [--check] [--from <file>]
#                                  write (or check) the private host mapping, mode 600, outside the repository. --from reads
#                                  NAME=value lines from a file (the private START-HERE file works, block in a code fence);
#                                  on a terminal it asks for what is still missing. Names already set in the environment win.
#   spx-credentials.sh dropbox     OAuth flow -> keychain + NAME=value lines on the clipboard
#   spx-credentials.sh tailscale   save a Tailscale auth key -> keychain + clipboard
#   spx-credentials.sh auth        paste the Google OAuth client id and secret (hidden) and the admin email(s) once -> keychain items
#                                  'spx-stats AUTH_GOOGLE_ID', 'spx-stats AUTH_GOOGLE_SECRET', 'spx-stats ADMIN_EMAILS', which ds1-preview.sh reads for Google sign-in on http://localhost:7700
#   spx-credentials.sh setup       new Mac: the host mapping (`hosts`, from SPX_HOSTS_SOURCE when that file is given), DS1 password
#                                  and board key from Dropbox -> keychain, then test, then `machine`.
#                                  Needs SPX_DS1_PASSWORD_FILE and SPX_BOARD_KEY_FILE; the private START-HERE file
#                                  has the full command. DS1 is found on the home LAN or over the VPN by itself
#                                  (SPX_DS1_HOST is an optional override).
#   spx-credentials.sh machine [--check] [--route lan|tailscale] [--link-macs]
#                                  the ds1 hosts name, the ds1 ssh key and `Host ds1` block (name = NAS1_SSH_ALIAS), and ssh to the other Mac.
#                                  Idempotent: a step already done prints ok and changes nothing. --check changes nothing.
#   spx-credentials.sh parity [<other-mac-alias>]
#                                  which keychain items are present here and on the other Mac (names only)
#   spx-credentials.sh copy-from <other-mac-alias> [item...]   pull items this Mac lacks from the other Mac
#   spx-credentials.sh copy-to   <other-mac-alias> [item...]   push items the other Mac lacks to it
#                                  default items: the required ones missing on the receiving Mac. Values travel over ssh stdin
#                                  and are never printed. The receiving login keychain may be locked for a non-tty ssh, so
#                                  the Mac login password is asked for (hidden) only if the first try fails.
# Secrets are read with hidden prompts, saved to the login keychain and never printed.
# The clipboard gets ready-to-paste NAME=value lines for the "spx-stats env" note.
set -eu

. "${0:A:h}/spx-checks.sh"

kc_save() { security add-generic-password -U -a "$USER" -s "$1" -w "$2" >/dev/null; }

# ---------- machine: hosts name, ds1 ssh, other-Mac ssh ----------
HOSTS_FILE="${SPX_HOSTS_FILE:-/etc/hosts}"
SSH_DIR="${SPX_SSH_DIR:-$HOME/.ssh}"
SSH_CONFIG="${SPX_SSH_CONFIG:-$SSH_DIR/config}"
BACKUP_DIR="${SPX_BACKUP_DIR:-$HOME/Projects/backups/mac-setup}"
# An ssh to another machine (never asks a question); SPX_SSH_BIN lets a test swap in a fake.
spx_ssh() { "${SPX_SSH_BIN:-ssh}" -o BatchMode=yes -o ConnectTimeout=8 "$@"; }
# A path as written into ssh config: ~/.ssh/x when the default dir, else absolute.
cfg_path() { if [ "$SSH_DIR" = "$HOME/.ssh" ]; then printf '~/.ssh/%s' "$1"; else printf '%s/%s' "$SSH_DIR" "$1"; fi; }
# has_host_block <alias>: does the ssh config already define `Host <alias>`?
has_host_block() { grep -Eq "^[[:space:]]*Host[[:space:]]+([^#]*[[:space:]])?$1([[:space:]]|\$)" "$SSH_CONFIG" 2>/dev/null; }
backup_ssh_config() {
  [ -f "$SSH_CONFIG" ] || return 0
  local dest="$BACKUP_DIR/$(date +%Y-%m-%d)-ssh-config-$(spx_this_mac)"
  [ -e "$dest" ] && dest="$dest-$(date +%H%M%S)"
  mkdir -p "$BACKUP_DIR" && cp -p "$SSH_CONFIG" "$dest" && echo "  (old ssh config saved to $dest)"
}
# add_ssh_block <text>: back up the config, then append the block after a blank line.
add_ssh_block() {
  mkdir -p -m 700 "$SSH_DIR"
  backup_ssh_config
  { [ -s "$SSH_CONFIG" ] && printf '\n'; printf '%s\n' "$1"; } >> "$SSH_CONFIG"
  chmod 600 "$SSH_CONFIG"
}
# make_key <file> <comment>: ed25519, no passphrase (an unattended login; a passphrase key was refused by the NAS).
make_key() { mkdir -p -m 700 "$SSH_DIR"; ssh-keygen -q -t ed25519 -N '' -C "$2" -f "$1"; }
# ds1_identity: the key the Host block of the DS1 alias uses (the last IdentityFile ssh resolves that exists), for authorizing.
ds1_identity() {
  local f r=""
  for f in $(ssh -F "$SSH_CONFIG" -G "$NAS1_SSH_ALIAS" 2>/dev/null | awk '$1=="identityfile"{print $2}'); do f="${f/#\~/$HOME}"; [ -f "$f" ] && r="$f"; done
  printf '%s' "$r"
}
ds1_ssh_test() { spx_ssh -F "$SSH_CONFIG" -o StrictHostKeyChecking=accept-new -o ControlMaster=no -o ControlPath=none "$NAS1_SSH_ALIAS" hostname 2>/dev/null | tail -n 1; }
# authorize <key.pub> <user@address> <Host-key-alias> <what-for>: one password login to install the public key.
authorize() {
  if [ ! -t 0 ]; then
    echo "  needs a terminal for the password prompt. Run: ssh-copy-id -i ${1/#$HOME/~} -o PubkeyAuthentication=no -o StrictHostKeyChecking=accept-new -o HostKeyAlias=$3 $2"
    return 1
  fi
  echo "  installing the key on $4: it asks once for that account's password."
  ssh-copy-id -i "$1" -o PubkeyAuthentication=no -o StrictHostKeyChecking=accept-new -o HostKeyAlias="$3" "$2" >/dev/null
}

# need_or_fail <label> <names...>: the private mapping must hold these names; else print "<label>: MISSING: ..." (one line) and return 1.
need_or_fail() {
  local label="$1" msg; shift
  spx_hosts_need "$@" 2>/dev/null && return 0
  msg=$(spx_hosts_need "$@" 2>&1 >/dev/null) || true
  echo "$label: ${msg:-MISSING: $*}"
  return 1
}

machine_hosts() {
  local route="$1" check="$2" cur addr A="$NAS1_SSH_ALIAS"
  need_or_fail "hosts $A" NAS1_LAN_PRIMARY NAS1_VPN_HOST || return 1
  cur=$(awk -v a="$A" '$1 !~ /^#/ { for (i = 2; i <= NF; i++) if ($i == a) { print $1; exit } }' "$HOSTS_FILE" 2>/dev/null)
  if [ -z "$cur" ]; then
    if [ -z "$route" ]; then
      # Always-on-VPN Mac -> the VPN address; a Mac that sits on the home LAN -> the LAN address.
      if limited 5 "$SPX_TAILSCALE_BIN" status >/dev/null 2>&1; then route=tailscale; else route=lan; fi
    fi
    if [ "$route" = tailscale ]; then addr="$SPX_DS1_VPN_HOST"; else addr="$SPX_DS1_LAN_PRIMARY"; fi
    if [ "$check" = 1 ]; then echo "hosts $A: WOULD add the name '$A' to $HOSTS_FILE (route $route; sudo asks for this Mac's password)"; return 0; fi
    echo "hosts $A: adding the name '$A' to $HOSTS_FILE (route $route). sudo will ask for this Mac's login password."
    { [ -z "$(tail -c1 "$HOSTS_FILE" 2>/dev/null)" ] || printf '\n'; printf '%s  %s\n' "$addr" "$A"; } | ${SPX_SUDO-sudo} tee -a "$HOSTS_FILE" >/dev/null || {
      echo "hosts $A: FAIL, could not write $HOSTS_FILE (it needs sudo; run this from a Terminal)"; return 1; }
    if [ "$HOSTS_FILE" = /etc/hosts ]; then ${SPX_SUDO-sudo} dscacheutil -flushcache || true; ${SPX_SUDO-sudo} killall -HUP mDNSResponder 2>/dev/null || true; fi
    cur="$addr"
  fi
  if nc -z -G 3 "$A" "$SPX_DS1_PORT" >/dev/null 2>&1; then echo "hosts $A: ok (DS1 Postgres answers on $SPX_DS1_PORT)"
  else
    echo "hosts $A: FAIL, the address set for $A does not answer on port $SPX_DS1_PORT (wrong network for that address? edit $HOSTS_FILE: the LAN address is NAS1_LAN_PRIMARY and the VPN one NAS1_VPN_HOST in the private mapping)"
    return 1
  fi
}

machine_ssh_ds1() {
  local check="$1" A="$NAS1_SSH_ALIAS" key name out addr id
  key="$SSH_DIR/id_ed25519_$A"
  name=$(spx_this_mac)
  need_or_fail "ssh $A" NAS1_LAN_PRIMARY NAS1_VPN_HOST NAS1_SSH_USER || return 1
  if has_host_block "$A"; then
    echo "ssh config Host $A: ok (already present, left alone)"
  else
    if [ -f "$key" ]; then echo "ssh key $(cfg_path id_ed25519_$A): ok (exists)"
    elif [ "$check" = 1 ]; then echo "ssh key $(cfg_path id_ed25519_$A): WOULD create (ed25519, no passphrase, comment spx-stats-$name-$A)"
    else make_key "$key" "spx-stats-$name-$A" && echo "ssh key $(cfg_path id_ed25519_$A): ok (created)"; fi
    if [ "$check" = 1 ]; then echo "ssh config Host $A: WOULD add (home LAN first, VPN otherwise) to $SSH_CONFIG"
    else
      add_ssh_block "# DS1 (nas1): home LAN first, VPN otherwise. Same on every Mac.
Match host $A exec \"nc -z -G 1 $SPX_DS1_LAN_PRIMARY 22 >/dev/null 2>&1\"
  HostName $SPX_DS1_LAN_PRIMARY
Host $A
  HostName $SPX_DS1_VPN_HOST
  HostKeyAlias $A
  User $SPX_DS1_SSH_USER
  IdentityFile $(cfg_path id_ed25519_$A)
  IdentitiesOnly yes"
      echo "ssh config Host $A: ok (added)"
    fi
  fi
  out=$(ds1_ssh_test || true)
  if [ -z "$out" ]; then
    if [ "$check" = 1 ]; then echo "ssh $A: WOULD authorize the key on DS1 (asks once for the NAS password of $SPX_DS1_SSH_USER)"; return 0; fi
    id="$key"; [ -f "$key" ] || id=$(ds1_identity)
    if [ -z "$id" ] || [ ! -f "$id.pub" ]; then echo "ssh $A: FAIL, no public key found to authorize (ssh-keygen -t ed25519 -N '' -f $key)"; return 1; fi
    if nc -z -G 2 "$SPX_DS1_LAN_PRIMARY" 22 >/dev/null 2>&1; then addr="$SPX_DS1_LAN_PRIMARY"; else addr="$SPX_DS1_VPN_HOST"; fi
    if authorize "$id.pub" "$SPX_DS1_SSH_USER@$addr" "$A" "DS1"; then
      out=$(ds1_ssh_test || true)
      if [ -n "$out" ]; then spx_ssh -F "$SSH_CONFIG" -o ControlPath=none "$A" 'chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys' >/dev/null 2>&1 || true; fi
    fi
  fi
  if [ -n "$out" ]; then
    addr=$(ssh -F "$SSH_CONFIG" -G "$A" 2>/dev/null | awk '$1=="hostname"{print $2}')
    if [ "$addr" = "$SPX_DS1_VPN_HOST" ]; then echo "ssh $A: ok ($out, VPN)"; else echo "ssh $A: ok ($out, home LAN)"; fi
  else
    echo "ssh $A: FAIL, key login refused or DS1 unreachable. If the key is installed, the NAS wants the home folder not group-writable: log in once as $SPX_DS1_SSH_USER and run: chmod 755 ~; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys"
    return 1
  fi
}

machine_ssh_mac() {
  local check="$1" link="$2" peer host keyname key out
  peer=$(spx_other_mac_alias); host=$(spx_other_mac_host); keyname=$(spx_other_mac_key); key="$SSH_DIR/$keyname"
  if [ "$(spx_this_mac)" = machine-unknown ] || [ -z "$host" ] || [ -z "${MACHINE_SSH_USER:-}" ]; then
    echo "ssh other Mac: SKIP, this Mac is not named in the private mapping (MACHINE1_LOCALNAME, MACHINE2_LOCALNAME, MACHINE1_HOST, MACHINE2_HOST, MACHINE_SSH_USER; $(spx_hosts_fix))"
    return 0
  fi
  if ! has_host_block "$peer"; then
    if [ "$link" != 1 ]; then
      echo "ssh $peer (other Mac): SKIP, no 'Host $peer' in the ssh config. Run machine --link-macs to create a passphrase-less key $(cfg_path $keyname) for it and authorize it on the other Mac (asks once for that Mac's login password; Remote Login must be on there)."
      return 0
    fi
    if [ "$check" = 1 ]; then echo "ssh $peer (other Mac): WOULD create key $(cfg_path $keyname), add 'Host $peer', authorize it"; return 0; fi
    [ -f "$key" ] || make_key "$key" "spx-stats-$(spx_this_mac)-$peer"
    add_ssh_block "# The other Mac (alias $peer). The two Macs use each other's alias from the private mapping (MACHINE1_SSH_ALIAS, MACHINE2_SSH_ALIAS).
Host $peer
  HostName $host
  User $MACHINE_SSH_USER
  IdentityFile $(cfg_path $keyname)
  IdentitiesOnly yes"
    echo "ssh config Host $peer: ok (added)"
  fi
  if ! nc -z -G 3 "$host" 22 >/dev/null 2>&1; then
    echo "ssh $peer (other Mac): SKIP, the other Mac does not answer on port 22 (asleep, off, another network, or Remote Login is off: System Settings > General > Sharing > Remote Login)"
    return 0
  fi
  out=$(spx_ssh -F "$SSH_CONFIG" -o StrictHostKeyChecking=accept-new -o ControlPath=none "$peer" 'scutil --get LocalHostName' 2>/dev/null | tail -n 1 || true)
  if [ -z "$out" ] && [ "$link" = 1 ] && [ "$check" != 1 ] && [ -f "$key.pub" ]; then
    if authorize "$key.pub" "$MACHINE_SSH_USER@$host" "$peer" "the other Mac"; then
      out=$(spx_ssh -F "$SSH_CONFIG" -o ControlPath=none "$peer" 'scutil --get LocalHostName' 2>/dev/null | tail -n 1 || true)
    fi
  fi
  if [ -n "$out" ]; then echo "ssh $peer (other Mac): ok"
  else echo "ssh $peer (other Mac): FAIL, key login refused. Run: zsh scripts/mac/spx-credentials.sh machine --link-macs"; return 1; fi
}

# ---------- hosts: the private host mapping file ----------
# Names the file may hold (scripts/mac/lib/hosts.sh explains each). REQUIRED ones have no default.
HOSTS_REQUIRED="NAS1_LAN_HOSTS NAS1_LAN_PRIMARY NAS1_VPN_HOST NAS1_SSH_USER NAS1_DOCKER_DIR MACHINE1_LOCALNAME MACHINE2_LOCALNAME MACHINE1_HOST MACHINE2_HOST MACHINE_SSH_USER"
HOSTS_OPTIONAL="NAS2_LAN_HOST NAS1_SSH_ALIAS NAS1_DB_PORT NAS1_DOCKER_BIN MACHINE1_SSH_ALIAS MACHINE2_SSH_ALIAS HOSTS_GUARD_WORDS"
# hosts_parse <file>: KEY<TAB>value for each known name found as NAME=value in the file (a plain env file, or a START-HERE
# file with the block pasted in a code fence). Quotes around the value are removed; other text is ignored.
hosts_parse() {
  awk -v keys="$HOSTS_REQUIRED $HOSTS_OPTIONAL" 'BEGIN { n = split(keys, a, " "); for (i = 1; i <= n; i++) ok[a[i]] = 1 }
    { l = $0; sub(/^[ \t]*(export[ \t]+)?/, "", l); i = index(l, "="); if (i < 2) next
      k = substr(l, 1, i - 1); v = substr(l, i + 1); if (!(k in ok)) next
      sub(/[ \t\r]+$/, "", v)
      if (v ~ /^".*"$/ || v ~ /^'"'"'.*'"'"'$/) v = substr(v, 2, length(v) - 2)
      print k "\t" v }' "$1"
}
hosts() {
  local check=0 from="" target="$SPX_MAP_FILE" k v line missing="" tmp dest tty=0
  local -A V
  while [ $# -gt 0 ]; do
    case "$1" in
      --check) check=1 ;;
      --from) from="${2:-}"; shift ;;
      *) echo "usage: spx-credentials.sh hosts [--check] [--from <file with NAME=value lines>]" >&2; return 2 ;;
    esac
    shift
  done
  [ -t 0 ] && tty=1
  # 1. what is there now, 2. what --from gives (wins), 3. names already set in the environment (win over both)
  if [ -r "$target" ]; then
    while IFS=$'\t' read -r k v; do [ -n "$k" ] && V[$k]="$v"; done < <(hosts_parse "$target")
  fi
  for k in ${=HOSTS_REQUIRED} ${=HOSTS_OPTIONAL}; do
    if [ -n "${(P)k:-}" ]; then V[$k]="${(P)k}"; fi
  done
  if [ -n "$from" ]; then
    [ -r "$from" ] || { echo "hosts: FAIL, cannot read $from"; return 1; }
    while IFS=$'\t' read -r k v; do [ -n "$k" ] && V[$k]="$v"; done < <(hosts_parse "$from")
  fi
  for k in ${=HOSTS_REQUIRED}; do [ -n "${V[$k]:-}" ] || missing="${missing:+$missing }$k"; done
  if [ $check = 1 ]; then
    for k in ${=HOSTS_REQUIRED}; do printf '%-22s %s\n' "$k" "$([ -n "${V[$k]:-}" ] && echo set || echo MISSING)"; done
    for k in ${=HOSTS_OPTIONAL}; do printf '%-22s %s\n' "$k" "$([ -n "${V[$k]:-}" ] && echo set || echo '(optional, default used)')"; done
    if [ -r "$target" ]; then
      echo "hosts: file $target exists, mode $(stat -f '%Lp' "$target")$([ "$(stat -f '%Lp' "$target")" = 600 ] || echo ' (should be 600)')"
    else echo "hosts: file $target does not exist"; fi
    if [ -z "$missing" ] && [ -r "$target" ]; then echo "hosts: ok"; return 0; fi
    echo "hosts: MISSING: ${missing:-nothing, but the file is not written yet}; run: zsh scripts/mac/spx-credentials.sh hosts [--from <private START-HERE file>]"
    return 1
  fi
  # 4. ask for what is still missing (a terminal only), showing optional ones with their defaults
  if [ -n "$missing" ] && [ $tty = 1 ]; then
    echo "hosts: values for the private host mapping (they are in the private START-HERE file). Nothing is sent anywhere; the file stays on this Mac."
    for k in ${=missing}; do read -r "v?$k: "; [ -n "$v" ] && V[$k]="$v"; done
    missing=""
    for k in ${=HOSTS_REQUIRED}; do [ -n "${V[$k]:-}" ] || missing="${missing:+$missing }$k"; done
  fi
  if [ -n "$missing" ]; then
    echo "hosts: MISSING: $missing (not written). Run it in a Terminal to be asked, or: zsh scripts/mac/spx-credentials.sh hosts --from <file holding NAME=value lines>"
    return 1
  fi
  # 5. write: directory 700, file 600, an existing different file saved first under the backups folder
  mkdir -p -m 700 "$(dirname "$target")"
  tmp="$target.new.$$"
  ( umask 077
    { echo "# Private host mapping for spx-stats. Never commit, never paste into chat. Written by spx-credentials.sh hosts."
      for k in ${=HOSTS_REQUIRED} ${=HOSTS_OPTIONAL}; do if [ -n "${V[$k]:-}" ]; then printf '%s="%s"\n' "$k" "${V[$k]}"; fi; done
    } > "$tmp" )
  chmod 600 "$tmp"
  if [ -f "$target" ] && ! cmp -s "$tmp" "$target"; then
    dest="$BACKUP_DIR/$(date +%Y-%m-%d)-hosts.env"; [ -e "$dest" ] && dest="$dest-$(date +%H%M%S)"
    mkdir -p "$BACKUP_DIR" && cp -p "$target" "$dest" && echo "hosts: (old mapping saved to $dest)"
  fi
  mv "$tmp" "$target"; chmod 600 "$target"
  echo "hosts: ok, wrote $target (mode 600)"
}

machine() {
  local check=0 route="" link=0 bad=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --check) check=1 ;;
      --link-macs) link=1 ;;
      --route) route="${2:-}"; shift ;;
      *) echo "usage: spx-credentials.sh machine [--check] [--route lan|tailscale] [--link-macs]" >&2; return 2 ;;
    esac
    shift
  done
  case "$route" in ""|lan|tailscale) ;; *) echo "--route takes lan or tailscale" >&2; return 2 ;; esac
  echo "machine: $(spx_this_mac)$([ $check = 1 ] && echo ' (check only, nothing changes)')"
  machine_hosts "$route" "$check" || bad=$((bad + 1))
  machine_ssh_ds1 "$check" || bad=$((bad + 1))
  machine_ssh_mac "$check" "$link" || bad=$((bad + 1))
  if [ $bad -eq 0 ]; then echo "machine: ok"; else echo "machine: $bad step(s) need attention (see FAIL above)"; return 1; fi
}

# ---------- keychain parity ----------
# load_remote <alias>: fills REMOTE_HAS[item]=1 for each item the other Mac's keychain holds (names only, one ssh).
typeset -gA REMOTE_HAS
remote_presence() {
  local it words="" line
  while IFS= read -r it; do words="$words ${(qq)it}"; done < <(spx_kc_required; spx_kc_optional)
  spx_ssh "$1" "for i in $words; do if security find-generic-password -s \"\$i\" >/dev/null 2>&1; then echo \"present \$i\"; else echo \"missing \$i\"; fi; done" 2>/dev/null |
    while IFS= read -r line; do
      case "$line" in "present "*) echo "${line#present }" ;; esac
    done
}
load_remote() { local it; REMOTE_HAS=(); for it in ${(f)"$(remote_presence "$1")"}; do REMOTE_HAS[$it]=1; done; }

parity() {
  local peer="${1:-$(spx_other_mac_alias)}" it here there reach=0 bad=0
  if spx_ssh "$peer" true >/dev/null 2>&1; then reach=1; load_remote "$peer"; fi
  printf '%-40s %-14s %s\n' "keychain item" "$(spx_this_mac)" "$peer"
  for it in ${(f)"$(spx_kc_required)"}; do
    if kc_has "$it"; then here=present; else here=MISSING; fi
    if [ $reach = 1 ]; then if [ -n "${REMOTE_HAS[$it]:-}" ]; then there=present; else there=MISSING; fi; else there="(no ssh)"; fi
    printf '%-40s %-14s %s   required\n' "$it" "$here" "$there"
    if [ "$here" != present ] || [ "$there" = MISSING ]; then bad=1; fi
  done
  for it in ${(f)"$(spx_kc_optional)"}; do
    if kc_has "$it"; then here=present; else here=absent; fi
    if [ $reach = 1 ]; then if [ -n "${REMOTE_HAS[$it]:-}" ]; then there=present; else there=absent; fi; else there="(no ssh)"; fi
    printf '%-40s %-14s %s   optional\n' "$it" "$here" "$there"
  done
  if [ $reach = 0 ]; then echo "parity: the other Mac ($peer) did not answer ssh; the first column is still right. Fix: zsh scripts/mac/spx-credentials.sh machine --link-macs"; return 1; fi
  if [ $bad = 0 ]; then echo "parity: ok (every required item is on both Macs)"
  else echo "parity: MISSING items. Fix, on the Mac that lacks them: zsh scripts/mac/spx-credentials.sh copy-from $peer"; return 1; fi
}

# ---------- copy items between the Macs ----------
# ask_login_password <alias>: hidden prompt on the terminal, value to stdout (captured by the caller); fails with no terminal.
ask_login_password() {
  local p
  { : </dev/tty; } 2>/dev/null || return 1
  printf 'Login password of the Mac "%s" (hidden): ' "$1" >/dev/tty; read -rs p </dev/tty; echo >/dev/tty
  printf '%s' "$p"
}
# kc_push <alias> <item>: send one item from this keychain to the other Mac. The value goes over ssh stdin (never in a
# command line we print, never echoed); on the other end `security add-generic-password` writes it. A non-tty ssh
# cannot write a locked keychain, so on failure we ask for the other Mac's login password (hidden) and unlock first.
kc_push() {
  local peer="$1" item="$2" val pw="" script rc
  val=$(security find-generic-password -s "$item" -w 2>/dev/null) || { echo "copy-to $peer: FAIL '$item' is not in this keychain"; return 1; }
  case "$val" in *$'\n'*) echo "copy-to $peer: FAIL '$item' has a multi-line value (not supported)"; return 1 ;; esac
  script='IFS= read -r P; IFS= read -r V; if [ -n "$P" ]; then security unlock-keychain -p "$P" "$HOME/Library/Keychains/login.keychain-db" >/dev/null 2>&1; fi; security add-generic-password -U -a "$USER" -s '"${(qq)item}"' -w "$V" >/dev/null 2>&1'
  rc=0; printf '%s\n%s\n' "$pw" "$val" | spx_ssh "$peer" "$script" >/dev/null 2>&1 || rc=$?
  if [ $rc -ne 0 ]; then
    pw=$(ask_login_password "$peer") || { val=""; echo "copy: FAIL, the first try was refused and there is no terminal to ask for the login password"; return 1; }
    rc=0; printf '%s\n%s\n' "$pw" "$val" | spx_ssh "$peer" "$script" >/dev/null 2>&1 || rc=$?
  fi
  val=""; pw=""
  if [ $rc -eq 0 ] && spx_ssh "$peer" "security find-generic-password -s ${(qq)item} >/dev/null 2>&1" >/dev/null 2>&1; then
    echo "copy-to $peer: ok '$item'"
  else echo "copy-to $peer: FAIL '$item' is not on $peer after the copy (wrong password, or the keychain there is locked)"; return 1; fi
}
# kc_pull <alias> <item>: read one item from the other Mac's keychain into this one.
kc_pull() {
  local peer="$1" item="$2" val="" pw="" script rc
  script='IFS= read -r P; if [ -n "$P" ]; then security unlock-keychain -p "$P" "$HOME/Library/Keychains/login.keychain-db" >/dev/null 2>&1; fi; security find-generic-password -s '"${(qq)item}"' -w'
  rc=0; val=$(printf '%s\n' "$pw" | spx_ssh "$peer" "$script" 2>/dev/null) || rc=$?
  if [ $rc -ne 0 ] || [ -z "$val" ]; then
    pw=$(ask_login_password "$peer") || { val=""; echo "copy: FAIL, the first try was refused and there is no terminal to ask for the login password"; return 1; }
    rc=0; val=$(printf '%s\n' "$pw" | spx_ssh "$peer" "$script" 2>/dev/null) || rc=$?
  fi
  pw=""
  val="${val##*$'\n'}"   # a login shell on the other side may print noise first; the value is the last line
  if [ $rc -ne 0 ] || [ -z "$val" ]; then val=""; echo "copy-from $peer: FAIL '$item' could not be read there (not present, wrong password, or locked)"; return 1; fi
  if kc_save "$item" "$val" 2>/dev/null && kc_has "$item"; then echo "copy-from $peer: ok '$item'"
  else val=""; echo "copy-from $peer: FAIL '$item' could not be saved to this keychain"; return 1; fi
  val=""
}
# copy <from|to> <alias> [item...]
copy() {
  local dir="$1" peer="${2:-}" it bad=0
  local -a todo
  [ -n "$peer" ] || { echo "usage: spx-credentials.sh copy-$dir <other-mac-alias> [item...]" >&2; return 2; }
  shift 2
  if ! spx_ssh "$peer" true >/dev/null 2>&1; then echo "copy-$dir $peer: FAIL, ssh to $peer does not work (run: zsh scripts/mac/spx-credentials.sh machine --link-macs)"; return 1; fi
  if [ $# -gt 0 ]; then todo=("$@")
  else
    load_remote "$peer"; todo=()
    for it in ${(f)"$(spx_kc_required)"}; do
      if [ "$dir" = from ]; then
        if ! kc_has "$it" && [ -n "${REMOTE_HAS[$it]:-}" ]; then todo+=("$it"); fi
      else
        if kc_has "$it" && [ -z "${REMOTE_HAS[$it]:-}" ]; then todo+=("$it"); fi
      fi
    done
    if [ ${#todo} -eq 0 ]; then echo "copy-$dir $peer: nothing to copy (no required item is missing on the receiving Mac that the sending Mac has)"; return 0; fi
  fi
  for it in "${todo[@]}"; do
    if [ "$dir" = from ]; then kc_pull "$peer" "$it" || bad=$((bad + 1)); else kc_push "$peer" "$it" || bad=$((bad + 1)); fi
  done
  [ $bad = 0 ]
}

case "${1:-}" in
dropbox)
  echo "Dropbox app first (console): https://www.dropbox.com/developers/apps/create"
  echo "  Scoped access > Full Dropbox > any name. Permissions tab: tick files.content.write,"
  echo "  files.content.read, files.metadata.read, press Submit. Settings tab has the key and secret."
  printf 'App key: ';    read -r key
  printf 'App secret (hidden): '; read -rs secret; echo
  open "https://www.dropbox.com/oauth2/authorize?client_id=${key}&response_type=code&token_access_type=offline"
  printf 'Click Allow in the browser, then paste the access code here: '; read -r code
  resp=$(printf 'user = "%s:%s"\n' "$key" "$secret" | curl -sS -K - https://api.dropbox.com/oauth2/token \
    -d code="$code" -d grant_type=authorization_code)
  refresh=$(printf '%s' "$resp" | plutil -extract refresh_token raw -o - - 2>/dev/null) || {
    echo "No refresh token came back (wrong code, or the code was used already). Run again."; exit 1; }
  kc_save "spx-stats dropbox app key" "$key"
  kc_save "spx-stats dropbox app secret" "$secret"
  kc_save "spx-stats dropbox refresh token" "$refresh"
  printf 'DROPBOX_APP_KEY=%s\nDROPBOX_APP_SECRET=%s\nDROPBOX_REFRESH_TOKEN=%s\n' "$key" "$secret" "$refresh" | pbcopy
  echo "Saved to the keychain. The three NAME=value lines are on the clipboard: paste them into your note."
  ;;
tailscale)
  echo "Make the key at https://login.tailscale.com/admin/settings/keys > Generate auth key:"
  echo "  Reusable ON, Ephemeral ON, Expiry 90 days (the maximum), Tags: none (or one you own)."
  printf 'Auth key (hidden): '; read -rs tskey; echo
  case "$tskey" in tskey-*) ;; *) echo "That does not look like a Tailscale auth key (tskey-...)."; exit 1;; esac
  kc_save "spx-stats tailscale authkey" "$tskey"
  printf 'TS_AUTHKEY=%s\n' "$tskey" | pbcopy
  echo "Saved to the keychain. TS_AUTHKEY=... is on the clipboard: paste it into your note."
  ;;
auth)
  # The sign-in settings of the always-on DS1 preview (http://localhost:7700). Production keeps these as Vercel secrets, which cannot be pulled,
  # so the Google client is pasted here once. ds1-preview.sh --install/--update reads the three keychain items; nothing is printed.
  echo "Google sign-in for the local preview. The OAuth client must allow http://localhost:7700 and http://localhost:7700/api/auth/callback/google."
  printf 'Google client id: '; read -r gid
  printf 'Google client secret (hidden): '; read -rs gsecret; echo
  printf 'Admin email(s), comma separated [john@spxis.com]: '; read -r admins
  admins="${admins:-john@spxis.com}"
  case "$gid" in *.apps.googleusercontent.com) ;; *) echo "That does not look like a Google client id (...apps.googleusercontent.com)."; exit 1;; esac
  [ -n "$gsecret" ] || { echo "No client secret entered."; exit 1; }
  admins="${admins// /}"
  printf '%s' "$gid$gsecret$admins" | grep -Eq '^[A-Za-z0-9._@,+/=:-]+$' || { echo "Unexpected characters in what you entered; nothing saved."; exit 1; }
  kc_save "spx-stats AUTH_GOOGLE_ID" "$gid"
  kc_save "spx-stats AUTH_GOOGLE_SECRET" "$gsecret"
  kc_save "spx-stats ADMIN_EMAILS" "$admins"
  unset gsecret
  for it in "spx-stats AUTH_GOOGLE_ID" "spx-stats AUTH_GOOGLE_SECRET" "spx-stats ADMIN_EMAILS"; do kc_has "$it" && echo "keychain: $it saved" || echo "keychain: $it NOT saved"; done
  echo "Next: bash scripts/mac/ds1-preview.sh --update   (puts them in the preview's 600 env file and restarts the site)"
  ;;
setup)
  : "${SPX_DS1_PASSWORD_FILE:?use the command in the private START-HERE file}" "${SPX_BOARD_KEY_FILE:?}"
  for f in "$SPX_DS1_PASSWORD_FILE" "$SPX_BOARD_KEY_FILE"; do
    [ -f "$f" ] || { echo "Not found: $f (is Dropbox installed and synced?)"; exit 1; }
  done
  path+=(/opt/homebrew/opt/libpq/bin)

  # The private host mapping first: without it DS1 cannot be found. SPX_HOSTS_SOURCE (optional) is a file holding the NAME=value
  # lines (the private START-HERE file works); on a terminal the script asks for what is missing. Then run again with the file in place.
  if [ -r "$SPX_MAP_FILE" ] && hosts --check >/dev/null 2>&1; then echo "hosts: ok ($SPX_MAP_FILE)"
  else
    if hosts ${SPX_HOSTS_SOURCE:+--from "$SPX_HOSTS_SOURCE"}; then
      [ "${SPX_HOSTS_RELOADED:-}" = 1 ] || SPX_HOSTS_RELOADED=1 exec zsh "${0:A}" "$@"   # start over so every address read below comes from the new file
    else
      echo "hosts: MISSING: no complete private host mapping yet; DS1 and the other Mac cannot be found until it exists. Fix: $(spx_hosts_fix)"
    fi
  fi

  if ! command -v psql >/dev/null; then echo "DS1: FAIL, no psql (run: brew install libpq)"
  elif ! SPX_DS1_FOUND=$(ds1_host); then echo "DS1: FAIL, $(ds1_missing)"
  elif ds1_ok "$(kc_get "spx-stats-db DS1 55440")"; then echo "DS1: ok (keychain, $(ds1_route "$SPX_DS1_FOUND"))"
  else
    pw=$(tr -d '\r\n' < "$SPX_DS1_PASSWORD_FILE" 2>/dev/null || true)
    if ds1_ok "$pw"; then kc_save "spx-stats-db DS1 55440" "$pw"; echo "DS1: ok (saved from Dropbox, $(ds1_route "$SPX_DS1_FOUND"))"
    else echo "DS1: FAIL, the password in SPX_DS1_PASSWORD_FILE was refused"; fi
  fi

  if board_ok "$(kc_get "sumilabu board spx-stats")"; then echo "board: ok (keychain)"
  else
    saved=0
    for k in ${(f)"$(grep -oE '[A-Za-z0-9_-]{32,}' "$SPX_BOARD_KEY_FILE" 2>/dev/null | sort -u)"}; do
      if board_ok "$k"; then kc_save "sumilabu board spx-stats" "$k"; saved=1; break; fi
    done
    [ $saved = 1 ] && echo "board: ok (saved from Dropbox)" || echo "board: FAIL, no key in SPX_BOARD_KEY_FILE was accepted"
  fi

  node_ok && echo "node: ok" || echo "node: FAIL, need 22.18 or newer"
  command -v pnpm >/dev/null && echo "pnpm: ok" || echo "pnpm: FAIL (run: npm i -g pnpm)"
  gh auth status >/dev/null 2>&1 && echo "gh: ok" || echo "gh: FAIL (run: unset GH_TOKEN; gh auth login)"

  # Then the per-Mac connections (hosts name, ds1 ssh, other-Mac ssh). Not fatal here; each step prints its own line.
  machine || true
  for it in ${(f)"$(spx_kc_required)"}; do
    kc_has "$it" || echo "keychain: MISSING '$it'. If the other Mac has it: zsh scripts/mac/spx-credentials.sh copy-from $(spx_other_mac_alias)"
  done
  ;;
hosts) shift; hosts "$@" ;;
machine) shift; machine "$@" ;;
parity) shift; parity "$@" ;;
copy-from) shift; copy from "$@" ;;
copy-to) shift; copy to "$@" ;;
*)
  echo "usage: spx-credentials.sh dropbox | tailscale | auth | setup | hosts [--check] [--from <file>] | machine [--check] [--route lan|tailscale] [--link-macs] | parity [alias] | copy-from <alias> [item...] | copy-to <alias> [item...]" >&2; exit 2;;
esac
