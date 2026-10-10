"""Read SQL Server 2000 data pages straight out of a .bak file (Microsoft Tape
Format wrapping the database's 8 KB pages), without SQL Server.
A page is recognised by its header: version 1, a known page type, file 1."""
import struct

PAGE = 8192


def pages(data):
    """Yield (offset, page bytes) for every database page in the backup, the
    alignment found from the file itself."""
    align = None
    for o in range(0, min(len(data), 64 * 1024 * 1024) - PAGE, 512):
        if is_page(data, o):
            align = o % PAGE
            break
    if align is None:
        return
    for o in range(align, len(data) - PAGE + 1, PAGE):
        if is_page(data, o):
            yield o, untorn(data[o:o + PAGE])


def untorn(p):
    """Undo torn-page detection: SQL Server 2000 replaces the low 2 bits of the
    last byte of sectors 2-16 with a toggle pattern and keeps the originals in
    the header's m_tornBits (bits 2k-2 and 2k-1 for sector k)."""
    if not struct.unpack_from('<H', p, 4)[0] & 0x100:
        return p
    torn = struct.unpack_from('<I', p, 60)[0]
    b = bytearray(p)
    for k in range(2, 17):
        i = k * 512 - 1
        b[i] = (b[i] & 0xFC) | ((torn >> (2 * (k - 1))) & 3)
    return bytes(b)


def is_page(d, o):
    return d[o] == 1 and d[o + 1] in (1, 2, 3, 4, 7, 8, 9, 10, 11, 13, 16) and d[o + 3] < 16 and \
        struct.unpack_from('<H', d, o + 36)[0] == 1


def header(p):
    return {
        "type": p[1], "level": p[3], "index_id": struct.unpack_from('<H', p, 6)[0],
        "prev": struct.unpack_from('<I', p, 8)[0], "pminlen": struct.unpack_from('<H', p, 14)[0],
        "next": struct.unpack_from('<I', p, 16)[0], "slots": struct.unpack_from('<H', p, 22)[0],
        "obj_id": struct.unpack_from('<i', p, 24)[0], "page_id": struct.unpack_from('<I', p, 32)[0],
    }


def records(p):
    """The raw records on a page, by slot (the slot array runs back from the end)."""
    h = header(p)
    for s in range(h["slots"]):
        off = struct.unpack_from('<H', p, PAGE - 2 * (s + 1))[0]
        if off < 96 or off >= PAGE:
            continue
        yield p, off


def split_record(p, off):
    """A primary record -> (fixed bytes, null bitmap, column count, [variable column bytes]) or None."""
    sa = p[off]
    rtype = (sa >> 1) & 7
    if rtype not in (0, 1):  # 0 primary, 1 forwarded (a row moved by an update); stubs, ghosts and index rows are skipped
        return None
    fend = struct.unpack_from('<H', p, off + 2)[0]
    if fend < 4 or off + fend + 2 > PAGE:
        return None
    fixed = p[off + 4: off + fend]
    ncols = struct.unpack_from('<H', p, off + fend)[0]
    if ncols == 0 or ncols > 1024:
        return None
    nb = (ncols + 7) // 8
    nulls = p[off + fend + 2: off + fend + 2 + nb]
    pos = off + fend + 2 + nb
    var = []
    if sa & 0x20:           # has variable-length columns
        if pos + 2 > PAGE:
            return None
        nvar = struct.unpack_from('<H', p, pos)[0]
        if nvar > ncols or pos + 2 + 2 * nvar > PAGE:
            return None
        ends = struct.unpack_from('<%dH' % nvar, p, pos + 2)
        start = pos + 2 + 2 * nvar
        for e in ends:
            e &= 0x7fff     # top bit marks a column stored off-row
            if e < start - off or off + e > PAGE:
                return None
            var.append(p[start: off + e])
            start = off + e
    return fixed, nulls, ncols, var


def is_null(nulls, colid):
    i = colid - 1
    return i // 8 < len(nulls) and bool(nulls[i // 8] & (1 << (i % 8)))


PFS_INTERVAL = 8088


def live(latest):
    """Keep the pages the database's PFS pages mark as allocated (0x40). A
    backup copies whole extents, so it also carries freed pages still holding
    rows from before a table was emptied, reloaded or dropped."""
    pfs = {pid: p for pid, p in latest.items() if p[1] == 11}
    out = {}
    for pid, p in latest.items():
        base = 1 if pid < PFS_INTERVAL else (pid // PFS_INTERVAL) * PFS_INTERVAL
        f = pfs.get(base)
        if f is None:
            continue
        i = pid if base == 1 else pid - base
        if f[96 + 4 + i] & 0x40:
            out[pid] = p
    return out
