#!/usr/bin/env python3
"""Ermittelt zu einer Liste deutscher Rapper die Apple-Künstler-IDs (iTunes Search API) und ein Bild
(Cover des ersten Titels) und schreibt data/artists.json.

Die Auswahl in ARTISTS ist eine redaktionelle Liste bekannter deutschsprachiger Rapper – KEIN offizielles
Ranking. Die API ist ratenbegrenzt (~20 Anfragen/Minute), darum läuft das Skript gedrosselt und ist
wiederholbar (bereits aufgelöste Künstler werden übersprungen).

Aufruf: python3 musik/tools/resolve_artists.py
"""
import json, re, sys, time, unicodedata, urllib.parse, urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "artists.json"
GAP = 3.3  # Sekunden zwischen Anfragen

# (Anzeigename, optionaler fester id-Slug)
ARTISTS = [
    "JUL", "Bobby Vandamme",
    "Azet", "Dardan", "Veysel", "Celo & Abdi", "Amo", "Aymen",
    "Capital Bra", "Samra", "Bonez MC", "RAF Camora", "Apache 207", "Luciano", "Ufo361", "Shindy", "Bushido",
    "Sido", "Kollegah", "Farid Bang", "Haftbefehl", "Fler", "Eko Fresh", "Kool Savas", "Casper", "Marteria",
    "Cro", "Prinz Pi", "Alligatoah", "Genetikk", "KC Rebell", "Summer Cem", "Mero", "Zuna", "Eno", "Nimo",
    "Gzuz", "LX", "Maxwell", "Hanybal", "Disarstar", "Kontra K", "Olexesh", "Jamule", "Loredana", "Majoe",
    "Moe Phoenix", "Mozzik", "Pashanim", "K.I.Z", "Fard", "Chefket", "Montez", "Ali Bumaye", "Massiv",
    "Animus", "Joka", "Said", "Manuellsen", "PA Sports", "Kianush", "Sinan-G", "Toxik", "Azzi Memo", "Nazar",
    "Trettmann", "Ski Aggu", "badmómzjay", "Shirin David", "Juju", "Nura", "SXTN", "Haiyti", "Lary",
    "Yung Hurn", "RIN", "Bausa", "Capo", "Gringo", "Fatoni", "Samy Deluxe", "Dendemann", "Blumentopf",
    "Fettes Brot", "Die Fantastischen Vier", "Curse", "Azad", "Ali As", "Frauenarzt", "Automatikk", "Tua",
    "Sierra Kidd", "Reezy", "Leon Machère", "18 Karat", "Nate57", "Jazeek", "Brudi030", "Mortel", "Ahzumjot",
    "Yassin", "Edgar Wasser", "Dame", "Kalazh44", "SSIO", "Schwesta Ewa", "Xatar", "Kay One", "Sun Diego",
    "Jalil", "Hava", "Lune", "Blokkmonsta", "Retrogott", "Megaloh",
    "Cr7z", "Dardan", "Kurdo", "Laas Unltd", "Sugar MMFK", 
]

RAP = {"Hip-Hop/Rap", "Rap", "Hip Hop/Rap", "German Hip-Hop", "Deutscher Hip-Hop", "Hip-Hop", "Deutscher Rap"}


def norm(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def slug(name):
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


last = 0.0


def api(path, **params):
    global last
    for attempt in range(6):
        wait = GAP - (time.time() - last)
        if wait > 0:
            time.sleep(wait)
        last = time.time()
        url = f"https://itunes.apple.com/{path}?" + urllib.parse.urlencode({"country": "de", **params})
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (rouge-artist-resolver)"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.load(r).get("results", [])
        except Exception as e:  # 403/429/Netz
            print(f"   retry {attempt + 1} ({e})", flush=True)
            time.sleep(8 * (attempt + 1))
    return []


def resolve(name):
    target = norm(name)
    cands = [r for r in api("search", term=name, entity="musicArtist", limit=15)
             if norm(r.get("artistName", "")) == target and r.get("artistId")]
    rap = [r for r in cands if r.get("primaryGenreName") in RAP]
    pick = (rap or cands or [None])[0]
    if not pick:  # Fallback: über Songs suchen
        songs = api("search", term=name, entity="song", attribute="artistTerm", limit=25)
        byid = {}
        for r in songs:
            if norm(r.get("artistName", "")) == target and r.get("primaryGenreName") in RAP:
                byid[r["artistId"]] = byid.get(r["artistId"], 0) + 1
        if byid:
            aid = max(byid, key=byid.get)
            pick = {"artistId": aid, "artistName": name, "primaryGenreName": "Hip-Hop/Rap"}
    if not pick:
        return None
    songs = [r for r in api("lookup", id=pick["artistId"], entity="song", limit=8)
             if r.get("wrapperType") == "track" and r.get("previewUrl") and r.get("artworkUrl100")]
    if not songs:
        return None
    art = songs[0]["artworkUrl100"]
    base = re.sub(r"/\d+x\d+(bb)?\.(jpg|png)$", "", art)
    ext = art.rsplit(".", 1)[-1]
    return {
        "id": slug(name), "name": pick["artistName"], "itunesId": pick["artistId"],
        "genre": pick.get("primaryGenreName", "Hip-Hop/Rap"),
        "image": {"small": f"{base}/200x200bb.{ext}", "large": f"{base}/1000x1000bb.{ext}"},
    }


def main():
    done = {}
    if OUT.exists():
        for a in json.loads(OUT.read_text("utf-8")):
            done[a["name"]] = a
    seen = set()
    missing = []
    for name in ARTISTS:
        if norm(name) in seen:
            continue
        seen.add(norm(name))
        if any(norm(k) == norm(name) for k in done):
            continue
        print(f"[{len(done)}] {name} …", flush=True)
        entry = resolve(name)
        if entry:
            done[entry["name"]] = entry
            OUT.parent.mkdir(exist_ok=True)
            OUT.write_text(json.dumps(list(done.values()), ensure_ascii=False, indent=1), "utf-8")
            print(f"   ok → {entry['itunesId']}", flush=True)
        else:
            missing.append(name)
            print("   NICHT GEFUNDEN", flush=True)
    print("FERTIG", len(done), "aufgelöst; nicht gefunden:", missing, flush=True)


if __name__ == "__main__":
    main()
