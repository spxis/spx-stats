import socket, subprocess, sys, threading
T = ["/home/user/spxwork/ts/tailscale_1.104.1_amd64/tailscale", "--socket=/home/user/spxwork/ts/tailscaled.sock", "nc", sys.argv[2], sys.argv[3]]
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("127.0.0.1", int(sys.argv[1]))); s.listen(8)
def pump(a, b):
    try:
        while (d := a(65536)): b(d)
    except Exception: pass
def serve(c):
    p = subprocess.Popen(T, stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0)
    def w(d): p.stdin.write(d); p.stdin.flush()
    threading.Thread(target=pump, args=(c.recv, w), daemon=True).start()
    pump(p.stdout.read, c.sendall); c.close(); p.kill()
while True:
    c, _ = s.accept(); threading.Thread(target=serve, args=(c,), daemon=True).start()
