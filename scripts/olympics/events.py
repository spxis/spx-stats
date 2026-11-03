"""The Olympic events this loader knows and the Games each was held at. Titles are the English Wikipedia articles' (redirects are followed by the API)."""

# Summer Games 1896-2024 (1906 Intercalated Games are not IOC Games and are left out; 1916, 1940 and 1944 were not held).
GAMES = [1896, 1900, 1904, 1908, 1912, 1920, 1924, 1928, 1932, 1936, 1948, 1952, 1956, 1960, 1964, 1968, 1972, 1976, 1980, 1984, 1988, 1992,
         1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024]

EVENTS = {
    "100m-m": {"title": "Athletics at the {y} Summer Olympics – Men's 100 metres", "years": GAMES},
    "100m-w": {"title": "Athletics at the {y} Summer Olympics – Women's 100 metres", "years": [y for y in GAMES if y >= 1928]},
}


def titles(keys):
    out = []
    for k, e in EVENTS.items():
        if keys and k not in keys: continue
        out += [(k, y, e["title"].format(y=y)) for y in e["years"]]
    return out
