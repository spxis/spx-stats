"""The Olympic events this loader knows and the Games each was held at. Titles are the English Wikipedia articles' (redirects are followed by the API)."""

# Summer Games 1896-2024 (1906 Intercalated Games are not IOC Games and are left out; 1916, 1940 and 1944 were not held).
GAMES = [1896, 1900, 1904, 1908, 1912, 1920, 1924, 1928, 1932, 1936, 1948, 1952, 1956, 1960, 1964, 1968, 1972, 1976, 1980, 1984, 1988, 1992,
         1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024]

EVENTS = {
    "100m-m": {"title": "Athletics at the {y} Summer Olympics – Men's 100 metres", "years": GAMES},
    "100m-w": {"title": "Athletics at the {y} Summer Olympics – Women's 100 metres", "years": [y for y in GAMES if y >= 1928]},
    # Swimming: no 100 m freestyle at 1900 (200 m) or 1904 (100 yards); women swam from 1912. The 2024 articles are titled "100-metre" and the API follows the redirect.
    "100free-m": {"title": "Swimming at the {y} Summer Olympics – Men's 100 metre freestyle", "years": [y for y in GAMES if y not in (1900, 1904)]},
    "100free-w": {"title": "Swimming at the {y} Summer Olympics – Women's 100 metre freestyle", "years": [y for y in GAMES if y >= 1912]},
}

# The other freestyle distances, in the Games each article exists for on English Wikipedia (the 1904 yard races, the 1896 500 m and 1200 m and the 1900 swims
# other than the 200 m have other titles and are left out; the 1906 Games are left out as everywhere).
FREESTYLE = {
    "50free-m": [1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024],
    "50free-w": [1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024],
    "200free-m": [1900, 1968, 1972, 1976, 1980, 1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024],
    "200free-w": [1968, 1972, 1976, 1980, 1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024],
    "400free-m": [1908, 1912, 1920, 1924, 1928, 1932, 1936, 1948, 1952, 1956, 1960, 1964, 1968, 1972, 1976, 1980, 1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024],
    "400free-w": [1924, 1928, 1932, 1936, 1948, 1952, 1956, 1960, 1964, 1968, 1972, 1976, 1980, 1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024],
    "800free-m": [2020, 2024],
    "800free-w": [1968, 1972, 1976, 1980, 1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024],
    "1500free-m": [1908, 1912, 1920, 1924, 1928, 1932, 1936, 1948, 1952, 1956, 1960, 1964, 1968, 1972, 1976, 1980, 1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024],
    "1500free-w": [2020, 2024],
}
for _k, _years in FREESTYLE.items():
    _d, _g = _k.split("free-")
    EVENTS[_k] = {"title": "Swimming at the {y} Summer Olympics – " + ("Men's" if _g == "m" else "Women's") + " " + _d + " metre freestyle", "years": _years}


def titles(keys):
    out = []
    for k, e in EVENTS.items():
        if keys and k not in keys: continue
        out += [(k, y, e["title"].format(y=y)) for y in e["years"]]
    return out
