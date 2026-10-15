#!/bin/bash
# Tests the private host mapping: the loader (scripts/mac/lib/hosts.sh), what spx-checks.sh derives from it, the `hosts` subcommand of
# spx-credentials.sh, and scripts/check_private_hosts.sh. Everything uses stand-ins (documentation addresses 192.0.2.x, 198.51.100.x) in a
# temporary folder: no keychain, no network, no real mapping file, nothing outside the temp folder is written.
#   bash scripts/mac/test/hosts-test.sh
HERE=$(cd "$(dirname "$0")" && pwd)
MAC="$HERE/.."
REPO="$HERE/../../.."
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/spx-hosts-test.XXXXXX")
trap 'rm -rf "$ROOT"' EXIT
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { local d=$1; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }
has() { grep -q -- "$2" "$1"; }
hasnt() { ! grep -qF -- "$2" "$1"; }

# a clean environment for every scenario: none of the mapping names set, and the config path pointing into the temp folder
clean() { unset $(env | sed -n 's/^\(\(NAS[12]\|MACHINE[12]\?\|HOSTS\)_[A-Z0-9_]*\)=.*/\1/p'); unset SPX_THIS_MAC SPX_DS1_HOST SPX_DS1_LAN_HOSTS SPX_DS1_VPN_HOST SPX_DS1_PORT SPX_DS1_LAN_PRIMARY SPX_DS1_SSH_USER; }
CFG="$ROOT/cfg/hosts.env"
export SPX_HOSTS_CONFIG="$CFG" SPX_BACKUP_DIR="$ROOT/bak"

FULL='# private mapping (stand-in values)
NAS1_LAN_HOSTS="nas.example.test 192.0.2.11 192.0.2.12"
NAS1_LAN_PRIMARY=192.0.2.11
NAS1_VPN_HOST=198.51.100.7
NAS1_SSH_USER=nasuser
NAS1_DOCKER_DIR=/vol/docker
NAS1_DOCKER_BIN=/usr/bin/docker
NAS1_SSH_ALIAS=nasalias
MACHINE1_LOCALNAME=ExampleDesk
MACHINE2_LOCALNAME=ExampleBook
MACHINE1_HOST=ExampleDesk.local
MACHINE2_HOST=ExampleBook.local
MACHINE1_SSH_ALIAS=desk
MACHINE2_SSH_ALIAS=book
MACHINE_SSH_USER=exuser
'
write_cfg() { mkdir -p "$(dirname "$CFG")"; printf '%s' "$1" > "$CFG"; chmod 600 "$CFG"; }

echo "(a) loader, no file"
clean; rm -rf "$ROOT/cfg"
for sh in bash zsh; do
  command -v $sh >/dev/null || continue
  out=$($sh -c ". '$MAC/lib/hosts.sh'; echo \"loaded=\$SPX_HOSTS_LOADED alias=\$NAS1_SSH_ALIAS port=\$NAS1_DB_PORT bin=\$NAS1_DOCKER_BIN m1=\$MACHINE1_SSH_ALIAS m2=\$MACHINE2_SSH_ALIAS vpn=[\${NAS1_VPN_HOST:-}]\"" 2>&1)
  check "$sh: defaults only (ds1, 55440, docker, machine1/2, nothing private)" test "$out" = "loaded=0 alias=ds1 port=55440 bin=docker m1=machine1 m2=machine2 vpn=[]"
  $sh -c ". '$MAC/lib/hosts.sh'; spx_hosts_need NAS1_VPN_HOST NAS1_SSH_USER" >"$ROOT/o" 2>&1; rc=$?
  check "$sh: need fails" test "$rc" = 1
  check "$sh: says MISSING and that the file does not exist" has "$ROOT/o" 'MISSING: the private host mapping .* does not exist'
  check "$sh: names the missing variables" has "$ROOT/o" 'NAS1_VPN_HOST, NAS1_SSH_USER'
  check "$sh: names the one fix" has "$ROOT/o" 'spx-credentials.sh hosts'
done

echo "(b) loader, file present"
write_cfg "$FULL
PATH=/evil
SOMETHING_ELSE=x
NAS1_VPN_HOST_EXTRA='quoted single'
export NAS1_SSH_ALIAS=nasalias
"
for sh in bash zsh; do
  command -v $sh >/dev/null || continue
  clean
  out=$($sh -c ". '$MAC/lib/hosts.sh'; echo \"\$SPX_HOSTS_LOADED|\$NAS1_LAN_HOSTS|\$NAS1_VPN_HOST|\$NAS1_DOCKER_DIR|\$NAS1_SSH_ALIAS|\$MACHINE2_SSH_ALIAS|\$NAS1_VPN_HOST_EXTRA|\${SOMETHING_ELSE:-unset}|\$PATH\"" 2>&1)
  check "$sh: values read, quotes removed, export prefix ok" test "$out" = "1|nas.example.test 192.0.2.11 192.0.2.12|198.51.100.7|/vol/docker|nasalias|book|quoted single|unset|$PATH"
  check "$sh: a name outside the allowed prefixes is ignored (PATH untouched)" test "$($sh -c ". '$MAC/lib/hosts.sh'; echo \$PATH" 2>&1)" = "$PATH"
  out=$(NAS1_VPN_HOST=198.51.100.99 $sh -c ". '$MAC/lib/hosts.sh'; echo \$NAS1_VPN_HOST" 2>&1)
  check "$sh: the environment wins over the file" test "$out" = 198.51.100.99
  out=$(NAS1_VPN_HOST= $sh -c ". '$MAC/lib/hosts.sh'; echo \"[\$NAS1_VPN_HOST]\"" 2>&1)
  check "$sh: an empty environment value also wins (a test can blank a name)" test "$out" = "[]"
  $sh -c ". '$MAC/lib/hosts.sh'; spx_hosts_need NAS1_VPN_HOST NAS1_LAN_PRIMARY" >"$ROOT/o" 2>&1
  check "$sh: need passes when all set" test "$?" = 0
done
write_cfg 'NAS1_LAN_PRIMARY=192.0.2.11
'
clean
bash -c ". '$MAC/lib/hosts.sh'; spx_hosts_need NAS1_VPN_HOST" >"$ROOT/o" 2>&1
check "file present but name absent: says not set in the file" has "$ROOT/o" 'MISSING: NAS1_VPN_HOST not set in'

echo "(c) spx-checks.sh derives its settings from the mapping"
write_cfg "$FULL"; clean
cat > "$ROOT/derive.sh" <<EOF
. '$MAC/spx-checks.sh'
echo "lan=\$SPX_DS1_LAN_HOSTS"; echo "vpn=\$SPX_DS1_VPN_HOST"; echo "port=\$SPX_DS1_PORT"; echo "primary=\$SPX_DS1_LAN_PRIMARY"; echo "user=\$SPX_DS1_SSH_USER"
echo "route_vpn=\$(ds1_route 198.51.100.7)"; echo "route_lan=\$(ds1_route 192.0.2.11)"; echo "route_alias=\$(ds1_route nasalias)"
echo "missing=\$(ds1_missing)"
SPX_THIS_MAC= MACHINE1_LOCALNAME=\$(scutil --get LocalHostName 2>/dev/null || hostname -s); export MACHINE1_LOCALNAME
echo "me=\$(spx_this_mac) other=\$(spx_other_mac_alias) otherhost=[\$(spx_other_mac_host)] key=\$(spx_other_mac_key)"
SPX_THIS_MAC=machine2; echo "as2: other=\$(spx_other_mac_alias) otherhost=[\$(spx_other_mac_host)] key=\$(spx_other_mac_key)"
SPX_THIS_MAC=; MACHINE1_LOCALNAME=nobody MACHINE2_LOCALNAME=nobody2; echo "unknown=\$(spx_this_mac)"
EOF
for sh in bash zsh; do
  command -v $sh >/dev/null || continue
  $sh "$ROOT/derive.sh" >"$ROOT/o" 2>&1
  check "$sh: LAN list = alias + NAS1_LAN_HOSTS" has "$ROOT/o" '^lan=nasalias nas.example.test 192.0.2.11 192.0.2.12$'
  check "$sh: VPN host, port, primary, user" test "$(grep -c -E '^(vpn=198.51.100.7|port=55440|primary=192.0.2.11|user=nasuser)$' "$ROOT/o")" = 4
  check "$sh: routes named without printing the address" test "$(grep -E '^route_' "$ROOT/o" | tr '\n' ' ')" = "route_vpn=VPN route_lan=home LAN route_alias=hosts-file name nasalias "
  check "$sh: ds1_missing (mapping present) names both routes" has "$ROOT/o" 'missing=not reachable on the home LAN or over the VPN'
  check "$sh: this Mac is machine1 by LocalHostName, other alias from the mapping" has "$ROOT/o" '^me=machine1 other=book otherhost=\[ExampleBook.local\] key=id_ed25519_book$'
  check "$sh: as machine2 the other alias is MACHINE1_SSH_ALIAS" has "$ROOT/o" '^as2: other=desk otherhost=\[ExampleDesk.local\] key=id_ed25519_desk$'
  check "$sh: an unnamed Mac is machine-unknown" has "$ROOT/o" '^unknown=machine-unknown$'
done
rm -f "$CFG"; clean
bash "$ROOT/derive.sh" >"$ROOT/o" 2>&1
check "no mapping: ds1_missing points at the hosts command" has "$ROOT/o" 'missing=no private host mapping (.* does not exist); run: zsh scripts/mac/spx-credentials.sh hosts'
check "no mapping: still only the ds1 name is probed" has "$ROOT/o" '^lan=ds1 $'

echo "(d) spx-credentials.sh hosts"
CRED="$MAC/spx-credentials.sh"
cat > "$ROOT/notes.md" <<'EOF'
# private notes (stand-in)
Some text that is not a setting. PATH=/evil is ignored, so is a line without a name.
```
NAS1_LAN_HOSTS="nas.example.test 192.0.2.11 192.0.2.12"
NAS1_LAN_PRIMARY=192.0.2.11
NAS1_VPN_HOST=198.51.100.7
NAS1_SSH_USER=nasuser
NAS1_DOCKER_DIR=/vol/docker
NAS1_DOCKER_BIN=/usr/bin/docker
MACHINE1_LOCALNAME=ExampleDesk
MACHINE2_LOCALNAME=ExampleBook
MACHINE1_HOST=ExampleDesk.local
MACHINE2_HOST=ExampleBook.local
MACHINE1_SSH_ALIAS=desk
MACHINE2_SSH_ALIAS=book
MACHINE_SSH_USER=exuser
```
EOF
clean; rm -rf "$ROOT/cfg" "$ROOT/bak"
zsh "$CRED" hosts --check >"$ROOT/o" 2>&1; rc=$?
check "--check with no file: exit 1" test "$rc" = 1
check "--check lists the missing names" has "$ROOT/o" 'NAS1_VPN_HOST *MISSING'
check "--check names the fix" has "$ROOT/o" 'MISSING: .*run: zsh scripts/mac/spx-credentials.sh hosts'
zsh "$CRED" hosts </dev/null >"$ROOT/o" 2>&1; rc=$?
check "no terminal and no values: exit 1, nothing written" test "$rc" = 1 -a ! -e "$CFG"
check "…and says how to give values" has "$ROOT/o" 'hosts --from'
zsh "$CRED" hosts --from "$ROOT/notes.md" </dev/null >"$ROOT/o" 2>&1; rc=$?
check "--from a notes file: exit 0" test "$rc" = 0
check "file written" test -f "$CFG"
check "file mode 600" test "$(stat -f '%Lp' "$CFG" 2>/dev/null || stat -c '%a' "$CFG")" = 600
check "directory mode 700" test "$(stat -f '%Lp' "$(dirname "$CFG")" 2>/dev/null || stat -c '%a' "$(dirname "$CFG")")" = 700
check "all stand-in values in the file" test "$(grep -c -E '^(NAS1_LAN_HOSTS="nas.example.test 192.0.2.11 192.0.2.12"|NAS1_VPN_HOST="198.51.100.7"|NAS1_SSH_USER="nasuser"|MACHINE2_SSH_ALIAS="book"|MACHINE_SSH_USER="exuser"|NAS1_DOCKER_DIR="/vol/docker")$' "$CFG")" = 6
check "an unrelated NAME in the notes (PATH) is not copied" hasnt "$CFG" 'evil'
check "defaults written too (alias, port)" test "$(grep -c -E '^(NAS1_SSH_ALIAS="ds1"|NAS1_DB_PORT="55440")$' "$CFG")" = 2
check "no value is printed" hasnt "$ROOT/o" '192.0.2'
check "no old file, so no backup" test ! -e "$ROOT/bak"
zsh "$CRED" hosts --check >"$ROOT/o" 2>&1; rc=$?
check "--check afterwards: ok" test "$rc" = 0 && has "$ROOT/o" '^hosts: ok$'
check "--check prints no value" hasnt "$ROOT/o" '198.51'
# one name changed through the environment: the file is rewritten and the old one saved
NAS1_VPN_HOST=198.51.100.8 zsh "$CRED" hosts </dev/null >"$ROOT/o" 2>&1
check "environment value written" has "$CFG" 'NAS1_VPN_HOST="198.51.100.8"'
check "old mapping saved under the backup folder" test "$(ls "$ROOT/bak" 2>/dev/null | wc -l | tr -d ' ')" = 1
check "…and the backup is the old one" has "$ROOT"/bak/*-hosts.env 'NAS1_VPN_HOST="198.51.100.7"'
zsh "$CRED" hosts --from "$ROOT/notes.md" </dev/null >/dev/null 2>&1
check "--from wins over the file (back to .7)" has "$CFG" 'NAS1_VPN_HOST="198.51.100.7"'
printf 'NAS1_VPN_HOST=198.51.100.7\n' > "$ROOT/partial.txt"; rm -f "$CFG"
zsh "$CRED" hosts --from "$ROOT/partial.txt" </dev/null >"$ROOT/o" 2>&1; rc=$?
check "a partial file is refused, nothing written" test "$rc" = 1 -a ! -e "$CFG"
check "…and names what is missing" has "$ROOT/o" 'MISSING: NAS1_LAN_HOSTS'
zsh "$CRED" bogus >"$ROOT/o" 2>&1
check "usage lists hosts" has "$ROOT/o" 'hosts \[--check\] \[--from <file>\]'

echo "(e) spx-credentials.sh machine --check reads the mapping"
write_cfg "$FULL"; clean
SPX_THIS_MAC=machine1 SPX_HOSTS_FILE="$ROOT/etc-hosts" SPX_SSH_DIR="$ROOT/ssh" SPX_SSH_CONFIG="$ROOT/ssh/config" zsh "$CRED" machine --check </dev/null >"$ROOT/o" 2>&1; rc=$?
check "machine --check exits 0" test "$rc" = 0
check "would add the NAS name from the mapping (NAS1_SSH_ALIAS)" has "$ROOT/o" "hosts nasalias: WOULD add the name 'nasalias'"
check "would create a key with a role-based comment" has "$ROOT/o" 'comment spx-stats-machine1-nasalias'
check "other Mac alias is the mapping's (book)" has "$ROOT/o" "ssh book (other Mac)"
check "nothing changed" test ! -e "$ROOT/ssh" -a ! -e "$ROOT/etc-hosts"
clean; rm -f "$CFG"
SPX_THIS_MAC=machine1 SPX_HOSTS_FILE="$ROOT/etc-hosts" SPX_SSH_DIR="$ROOT/ssh" SPX_SSH_CONFIG="$ROOT/ssh/config" zsh "$CRED" machine --check </dev/null >"$ROOT/o" 2>&1; rc=$?
check "no mapping: machine says MISSING with the fix" has "$ROOT/o" 'MISSING: the private host mapping .* does not exist'
check "no mapping: exit 1" test "$rc" = 1

echo "(f) spx-check.sh host-mapping line"
cat > "$ROOT/line.sh" <<EOF
SPX_CHECK_LIB_ONLY=1
HERE='$MAC'
. '$MAC/spx-check.sh'
check_hosts
cat "\$OUT/13"
EOF
write_cfg "$FULL"; clean
bash "$ROOT/line.sh" >"$ROOT/o" 2>&1
check "complete mapping: ok line" has "$ROOT/o" '^host mapping (.*): ok$'
rm -f "$CFG"; clean
bash "$ROOT/line.sh" >"$ROOT/o" 2>&1
check "no mapping: MISSING line with the fix" has "$ROOT/o" '^host mapping: MISSING: file .* does not exist; zsh scripts/mac/spx-credentials.sh hosts'
write_cfg 'NAS1_LAN_PRIMARY=192.0.2.11
'; clean
bash "$ROOT/line.sh" >"$ROOT/o" 2>&1
check "partial mapping: names what is empty" has "$ROOT/o" 'NAS1_VPN_HOST empty'

echo "(g) check_private_hosts.sh"
GUARD="$MAC/../check_private_hosts.sh"
G="$ROOT/guardrepo"; mkdir -p "$G/sub"
git -C "$G" init -q
printf 'plain text, version 2.10.30.4 is not an address\ncontact 192.0.2.7 198.51.100.9 203.0.113.5 and 100.200.1.1 and 11.0.0.1 and 172.32.0.1 and 127.0.0.1\nloadGuard and Dis kStation are fine\n' > "$G/ok.md"
clean; rm -f "$CFG"
bash "$GUARD" "$G" >"$ROOT/o" 2>&1; rc=$?
check "clean repo (documentation ranges, near misses): ok" test "$rc" = 0 && has "$ROOT/o" 'check_private_hosts: ok'
# each offender is made at run time from fragments, so this test file holds none of them
hit() { # description, text, offender: a file with that text must be reported, by file name, and the offender never printed
  printf '%s\n' "$2" > "$G/sub/bad.txt"
  bash "$GUARD" "$G" >"$ROOT/o" 2>&1; rc=$?
  check "$1: exit 1" test "$rc" = 1
  check "$1: names the file and line" has "$ROOT/o" '^sub/bad.txt:1: '
  check "$1: does not echo the offender" hasnt "$ROOT/o" "$3"
}
o() { hit "$2" "x $1 y" "$1"; }
o "10.$((0+1)).2.3" "10.x address"
o "192.168.$((0+1)).9" "192.168 address"
o "172.2$((0+0)).4.5" "172.16-31 address"
o "100.$((80+7)).30.7" "100.64-127 address"
o "Mac"" Studio" "desktop model name"
o "Mac""Book" "laptop model name"
o "Disk""Station""1.local" "NAS model name"
o "Syno""logy" "NAS vendor"
o "DS""M" "NAS OS"
o "/vol""ume2/docker/x" "NAS share path"
o "Container"" Manager" "container UI"
o "File"" Station" "file manager"
o "/Us""ers/someone/Projects" "home folder"
rm -f "$G/sub/bad.txt"
# the mapping's own values, when the mapping exists: never in a committed file
write_cfg "$FULL
HOSTS_GUARD_WORDS=\"zebra-secret\"
"; clean
printf 'the lan is 192.0.2.11 only\n' > "$G/sub/m1.txt"
bash "$GUARD" "$G" >"$ROOT/o" 2>&1; rc=$?
check "a mapping address (even in a documentation range) is reported when the mapping exists" test "$rc" = 1 && has "$ROOT/o" '^sub/m1.txt:1: a value from the private host mapping$'
check "…without printing it" hasnt "$ROOT/o" '192.0.2.11'
printf 'see ExampleBook.local\n' > "$G/sub/m1.txt"
bash "$GUARD" "$G" >"$ROOT/o" 2>&1; check "a mapping host name is reported" test "$?" = 1
printf 'the word Zebra-Secret\n' > "$G/sub/m1.txt"
bash "$GUARD" "$G" >"$ROOT/o" 2>&1; check "HOSTS_GUARD_WORDS is honoured (case-insensitive)" test "$?" = 1
printf 'nothing here\n' > "$G/sub/m1.txt"
bash "$GUARD" "$G" >"$ROOT/o" 2>&1; check "…and clean again" test "$?" = 0
# an ignored file is not scanned, an untracked one is
printf 'hosts.env\n' > "$G/.gitignore"; printf 'NAS1_LAN_PRIMARY=192.168.%s.1\n' 1 > "$G/hosts.env"
bash "$GUARD" "$G" >"$ROOT/o" 2>&1; check "a git-ignored hosts.env is not scanned" test "$?" = 0
rm -f "$CFG"; clean
echo "(h) the repository itself"
bash "$GUARD" "$REPO" >"$ROOT/o" 2>&1; rc=$?
check "the repository holds no private address or name" test "$rc" = 0
if [ "$rc" != 0 ]; then sed -n 1,10p "$ROOT/o" | cut -c1-160; fi
check ".gitignore keeps hosts.env out" test "$(grep -c -E '^(hosts.env|\*.hosts.env)$' "$REPO/.gitignore")" = 2

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" = 0 ]
