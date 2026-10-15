# How deploy-prebuilt.sh treats the exit code of scripts/mac/same-data.py.
# same_data_gate <rc> <force 0|1> prints one word: ok, warn, differ, unread.
# A data difference (1) continues only with force. Unreadable (anything else) never does.
same_data_gate() {
  case "$1:$2" in
    0:*) printf '%s\n' ok ;;
    1:1) printf '%s\n' warn ;;
    1:*) printf '%s\n' differ ;;
    *) printf '%s\n' unread ;;
  esac
}
