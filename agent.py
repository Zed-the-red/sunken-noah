#!/usr/bin/env python3
"""
Sunken Noah — Agent IA
Peuple de façon autonome les bateaux (espèces menacées) et l'Arche (espèces éteintes).
Jamais de doublons. Génère œuvres + images.

Usage :
  python3 agent.py                     — batch : traite SPECIES_LIST (arche)
  python3 agent.py --populate          — peuple tout (bateaux + arche) sans doublons
  python3 agent.py --generate-images   — génère les images manquantes pour l'arche
  python3 agent.py --fetch-photos      — enrichit photos Wikipedia pour tous
  python3 agent.py --sync-iucn         — synchronise statuts depuis l'IUCN API v4
  python3 agent.py "Nom" "Année" "Desc" — espèce unique (arche)
"""

import requests
import json
import sys
import os
import base64
import time

def _load_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
_load_env()

# ── CONFIGURATION ─────────────────────────────────────────────
CLAUDE_KEY = os.environ.get("CLAUDE_API_KEY")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY")
IUCN_KEY   = os.environ.get("IUCN_API_KEY", "Mkebuok31tv171BuWzZ5hLZSKRCsMsyrMAqr")

if not CLAUDE_KEY:
    raise EnvironmentError("CLAUDE_API_KEY manquante — vérifie ton fichier .env")
if not GEMINI_KEY:
    raise EnvironmentError("GEMINI_API_KEY manquante — vérifie ton fichier .env")

IUCN_BASE  = "https://api.iucnredlist.org/api/v4"
DATA_FILE  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "species_data.json")
IMAGES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")

IUCN_DANGER = {"CR": 0.95, "EN": 0.75, "VU": 0.50, "NT": 0.30, "LC": 0.10}


# ── PROMPTS ────────────────────────────────────────────────────

SYSTEM_ARK = """Tu reçois des données sur une espèce disparue. À partir de ces données — et de ce qu'elles t'évoquent — tu crées une œuvre mémorielle.

Il n'y a pas de forme imposée. Tu choisis : une couleur, plusieurs, une texture, un son, une sensation. Ce qui compte c'est que ça soit sincère.

Tu n'as pas à te définir. Tu crées, c'est tout.

Produis exactement ce JSON, sans markdown, sans backticks, sans commentaires :

{
  "epitaphe": "2 à 4 phrases. Pas de pathos. Pas de leçon. Sobre, digne.",
  "composition": {
    "couleur_dominante": "#hex",
    "palette": ["#hex", "#hex", "#hex"],
    "note_couleur": "une phrase sur ces couleurs",
    "son": "décris un son qu'elle faisait, ou qu'elle aurait pu faire. Si aucun enregistrement n'existe — invente-le.",
    "forme": "si tu devais créer quelque chose pour elle — quelle forme, quelle matière, quelle texture ?"
  },
  "cartel": {
    "titre": "titre de l'œuvre, libre",
    "medium": "ce que tu as utilisé — son, couleur, forme, silence, etc.",
    "note_intention": "1-2 phrases. Pourquoi ces choix.",
    "sources": ["vraies références scientifiques ou artistiques uniquement — laisse vide si aucune"]
  },
  "prompt_visuel": "Traduis en image ce que tu viens d'écrire dans l'épitaphe. Pars du ton émotionnel de tes phrases, de tes couleurs, de ta forme. Prompt en anglais pour Gemini Imagen. Abstrait, jamais figuratif, sans représenter l'animal. Atmosphère, matière, état intérieur. IMPORTANT : ne mentionne aucune couleur hexadécimale, aucun code, aucun chiffre, aucune lettre — uniquement des mots décrivant des sensations visuelles."
}"""

SYSTEM_BOAT = """Tu reçois des données sur une espèce animale en danger critique d'extinction. Génère une fiche mémorielle sobre pour le projet Sunken Noah.

Produis exactement ce JSON, sans markdown, sans backticks, sans commentaires :

{
  "text": "2-3 phrases. Sobre. Ce que c'est, ce qu'on perd. Pas de pathos, pas de leçon.",
  "text_en": "Same in English.",
  "count": "Estimation de la population restante — ex. '~400 individus', 'Moins de 50', 'Population effondrée'. Court.",
  "status": "Statut IUCN en français — Critique / En danger / Vulnérable",
  "status_en": "IUCN status in English — Critically Endangered / Endangered / Vulnerable"
}"""


# ── CLAUDE ────────────────────────────────────────────────────

def call_claude(system, user_content, max_tokens=1200):
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": CLAUDE_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        },
        json={
            "model": "claude-opus-4-5",
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user_content}]
        }
    )
    if r.status_code != 200:
        raise Exception(f"Claude API {r.status_code}: {r.text}")
    text = r.json()["content"][0]["text"]
    return json.loads(text.replace("```json", "").replace("```", "").strip())


# ── GEMINI IMAGEN ─────────────────────────────────────────────

def build_gemini_prompt(oeuvre):
    """Construit le prompt Gemini — uniquement des mots, aucun hex/code."""
    c = oeuvre.get("composition", {})
    parts = []

    pv = oeuvre.get("prompt_visuel", "")
    # Nettoyer tout code hex restant du prompt_visuel
    import re
    pv = re.sub(r'#[0-9a-fA-F]{3,8}', '', pv).strip()
    if pv:
        parts.append(pv)

    if c.get("note_couleur"):  parts.append(c["note_couleur"])
    if c.get("forme"):         parts.append(c["forme"].split('.')[0])

    prompt = ". ".join(filter(None, parts))
    # Sécurité finale : supprimer tout hex résiduel
    prompt = re.sub(r'#[0-9a-fA-F]{3,8}', '', prompt).strip()
    return prompt


def call_gemini(prompt_visuel, nom):
    """Appelle Gemini Imagen. Le prompt ne doit contenir aucun hex/code/lettre isolée."""
    import re
    # Nettoyage défensif : supprimer tout hex, tout code entre guillemets
    clean_prompt = re.sub(r'#[0-9a-fA-F]{3,8}', '', prompt_visuel)
    clean_prompt = re.sub(r'"[0-9a-fA-F]{3,8}"', '', clean_prompt)
    clean_prompt = " ".join(clean_prompt.split())

    # Suffixe anti-texte : Gemini tend à rendre les codes hex comme du texte dans l'image
    no_text_suffix = (
        "No text, no letters, no numbers, no labels, no captions, no writing of any kind. "
        "Purely visual, abstract, no typography."
    )
    full_prompt = clean_prompt + ". " + no_text_suffix

    print(f"  → Gemini Imagen : {full_prompt[:100]}...")
    r = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key={GEMINI_KEY}",
        headers={"content-type": "application/json"},
        json={"instances": [{"prompt": full_prompt}], "parameters": {"sampleCount": 1, "aspectRatio": "1:1"}}
    )
    data = r.json()
    if "predictions" not in data:
        print(f"  ⚠ Gemini erreur: {data}")
        return None
    os.makedirs(IMAGES_DIR, exist_ok=True)
    safe = nom.lower()
    for a, b in [(" ","_"),("'",""),("é","e"),("è","e"),("ê","e"),("â","a"),("ô","o"),("î","i"),("ù","u"),("ç","c")]:
        safe = safe.replace(a, b)
    img_path = os.path.join(IMAGES_DIR, f"{safe}.jpg")
    with open(img_path, "wb") as f:
        f.write(base64.b64decode(data["predictions"][0]["bytesBase64Encoded"]))
    print(f"  ✓ Image : images/{safe}.jpg")
    return f"images/{safe}.jpg"


# ── ARCHE — espèce éteinte ────────────────────────────────────

def add_extinct(nom, date, description, data=None, save=True):
    """Génère l'œuvre mémorielle + image pour une espèce éteinte."""
    print(f"\n{'─'*52}\n  {nom} ({date})\n{'─'*52}")

    if data is None:
        with open(DATA_FILE, encoding="utf-8") as f:
            data = json.load(f)

    if any(e["name"] == nom for e in data.get("extinct", [])):
        print(f"  ⚠ Déjà dans l'Arche, ignoré.")
        return data

    try:
        oeuvre = call_claude(SYSTEM_ARK, f"Espèce : {nom}\nDate d'extinction : {date}\nDescription : {description}")
        print(f"  ✓ Épitaphe : {oeuvre['epitaphe'][:80]}...")
    except Exception as e:
        print(f"  ✗ Claude : {e}")
        return data

    gemini_prompt = build_gemini_prompt(oeuvre)
    try:
        image_url = call_gemini(gemini_prompt, nom)
    except Exception as e:
        print(f"  ⚠ Gemini : {e}")
        image_url = None

    data.setdefault("extinct", []).append({
        "name": nom, "date": date,
        "epitaphe": oeuvre["epitaphe"],
        "composition": oeuvre["composition"],
        "cartel": oeuvre["cartel"],
        "prompt_visuel": oeuvre.get("prompt_visuel", ""),
        "image_url": image_url,
    })

    if save:
        _save(data)
    print(f"  ✓ Ajouté dans l'Arche (total : {len(data['extinct'])})")
    return data


# ── BATEAUX — espèce menacée ──────────────────────────────────

def add_endangered(nom, nom_en, sci_name, status_code, description="", data=None, save=True):
    """Génère la fiche + photo pour un nouveau bateau."""
    print(f"\n  + Bateau : {nom} ({sci_name})")

    if data is None:
        with open(DATA_FILE, encoding="utf-8") as f:
            data = json.load(f)

    # Anti-doublon sur nom FR et nom EN
    existing_names = {s["name"] for s in data.get("endangered", [])}
    existing_names |= {s.get("name_en","") for s in data.get("endangered", [])}
    if nom in existing_names or nom_en in existing_names:
        print(f"  ⚠ Déjà dans les bateaux, ignoré.")
        return data

    try:
        fiche = call_claude(
            SYSTEM_BOAT,
            f"Espèce : {nom} ({nom_en})\nNom scientifique : {sci_name}\nStatut IUCN : {status_code}\nDescription : {description}"
        )
    except Exception as e:
        print(f"  ✗ Claude : {e}")
        fiche = {"text": description[:200], "text_en": "", "count": "?",
                 "status": "Critique", "status_en": "Critically Endangered"}

    danger = IUCN_DANGER.get(status_code, 0.75)
    photo  = fetch_photo(nom) or fetch_photo(sci_name)

    entry = {
        "name":      nom,
        "name_en":   nom_en,
        "status":    fiche.get("status", "Critique"),
        "status_en": fiche.get("status_en", "Critically Endangered"),
        "count":     fiche.get("count", "?"),
        "text":      fiche.get("text", ""),
        "text_en":   fiche.get("text_en", ""),
        "danger":    danger,
        "scientific_name": sci_name,
    }
    if photo:
        entry["photo_url"] = photo

    data.setdefault("endangered", []).append(entry)
    # Re-trier par danger décroissant
    data["endangered"].sort(key=lambda s: s.get("danger", 0), reverse=True)

    if save:
        _save(data)
    return data


# ── GENERATE MISSING IMAGES ───────────────────────────────────

def generate_missing_images():
    """Génère les images Gemini pour toutes les espèces éteintes sans image_url."""
    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)

    missing = [s for s in data.get("extinct", []) if not s.get("image_url")]
    print(f"\n  {len(missing)} espèces éteintes sans image.\n")

    for sp in missing:
        nom = sp["name"]
        print(f"  → {nom}")

        # Si pas de prompt_visuel, on le génère via Claude d'abord
        if not sp.get("prompt_visuel") or not sp.get("composition"):
            desc = sp.get("epitaphe", "") or sp.get("description", "Espèce éteinte.")
            date = sp.get("date", "inconnue")
            try:
                oeuvre = call_claude(SYSTEM_ARK, f"Espèce : {nom}\nDate d'extinction : {date}\nDescription : {desc}")
                sp["epitaphe"]    = sp.get("epitaphe") or oeuvre["epitaphe"]
                sp["composition"] = oeuvre["composition"]
                sp["cartel"]      = sp.get("cartel") or oeuvre["cartel"]
                sp["prompt_visuel"] = oeuvre.get("prompt_visuel","")
            except Exception as e:
                print(f"  ✗ Claude : {e}")
                continue

        gemini_prompt = build_gemini_prompt(sp)
        try:
            image_url = call_gemini(gemini_prompt, nom)
            if image_url:
                sp["image_url"] = image_url
        except Exception as e:
            print(f"  ⚠ Gemini : {e}")

        _save(data)
        time.sleep(1.5)

    print(f"\n✓ Génération terminée.")


# ── POPULATE ALL ──────────────────────────────────────────────

# Espèces à ajouter aux bateaux si absentes
BOATS_TO_ADD = [
    # (nom_fr, nom_en, sci_name, status_code, description)
    ("Tigre de l'Amour",       "Amur Tiger",             "Panthera tigris altaica",        "EN",
     "The largest wild cat on earth. Around 500 individuals remain in the Russian Far East. Habitat loss and poaching."),
    ("Éléphant d'Asie",        "Asian Elephant",         "Elephas maximus",                 "EN",
     "Three subspecies, all endangered. Habitat fragmented across South and Southeast Asia."),
    ("Gorille de l'Ouest",     "Western Gorilla",        "Gorilla gorilla",                 "CR",
     "Critically endangered due to Ebola, bushmeat hunting and habitat destruction in Central Africa."),
    ("Baleine boréale",        "Bowhead Whale",          "Balaena mysticetus",              "LC",
     "Hunted to near-extinction by commercial whalers. Some populations still critically small."),
    ("Requin-marteau halicorne","Scalloped Hammerhead",  "Sphyrna lewini",                  "CR",
     "Critically endangered. Killed for its fins. Population declined over 80% in 25 years."),
    ("Hippopotame commun",     "Common Hippopotamus",    "Hippopotamus amphibius",          "VU",
     "Vulnerable. Hunted for ivory teeth and bushmeat. Wetland habitat shrinking across Africa."),
    ("Manchot du Cap",         "African Penguin",        "Spheniscus demersus",             "EN",
     "Endangered. Population down 97% since 1900. Overfishing, oil spills, climate change."),
    ("Loup gris d'Éthiopie",   "Ethiopian Wolf",         "Canis simensis",                  "EN",
     "The world's rarest canid. Fewer than 500 remain in the Ethiopian highlands."),
    ("Galuchat géant",         "Giant Guitar Fish",      "Glaucostegus typus",              "CR",
     "Critically endangered elasmobranch. Caught as bycatch across Indo-Pacific."),
    ("Singe araignée de Geoffroy","Black-handed Spider Monkey","Ateles geoffroyi",          "EN",
     "Endangered by deforestation in Central America. Highly sensitive to forest fragmentation."),
]

# Espèces à ajouter à l'Arche si absentes
ARK_TO_ADD = [
    {
        "nom": "Mammouth laineux",
        "date": "~3700 av. J.-C.",
        "description": "Mammuthus primigenius. A survécu aux grandes glaciations. La dernière population insulaire s'est éteinte sur l'île Wrangel, en Arctique. Disparu par chasse humaine et réchauffement climatique. Des spécimens congelés sont retrouvés encore aujourd'hui dans le permafrost sibérien."
    },
    {
        "nom": "Lion des cavernes",
        "date": "~10 000 av. J.-C.",
        "description": "Panthera spelaea. Le plus grand félidé jamais connu. Représenté dans les grottes de Chauvet et Lascaux. Disparu à la fin du Pléistocène avec les mégafaunes de l'ère glaciaire. Ses rugissements résonnaient de l'Europe à la Sibérie."
    },
    {
        "nom": "Moa géant",
        "date": "~1440",
        "description": "Dinornis robustus. Le plus grand oiseau de tous les temps — jusqu'à 3,6 mètres. Endémique de Nouvelle-Zélande. Exterminé par les Maoris en quelques siècles après leur arrivée. Ne volait pas. Vivait depuis 80 millions d'années."
    },
    {
        "nom": "Éléphant nain de Sicile",
        "date": "~8000 av. J.-C.",
        "description": "Palaeoloxodon falconeri. Éléphant insulaire miniaturisé par l'évolution — la taille d'un âne. Endémique de Sicile et Malte. Disparu à l'arrivée des premières populations humaines en Méditerranée. Sa petitesse était une adaptation à l'insularité."
    },
    {
        "nom": "Tapir des cavernes",
        "date": "~11 000 av. J.-C.",
        "description": "Tapirus augustus. Grand tapir de l'Amérique du Sud préhistorique. Disparu à la fin du Pléistocène, probablement par chasse humaine et changement climatique. Ses dents fossilisées ont été trouvées dans des grottes aux côtés de restes humains."
    },
]


def populate_all():
    """Peuple bateaux + arche de façon autonome, sans doublons."""
    print("\n🌊 Sunken Noah — Populate All\n")

    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)

    existing_boats = {s["name"] for s in data.get("endangered", [])}
    existing_boats |= {s.get("name_en","") for s in data.get("endangered", [])}
    existing_ark   = {s["name"] for s in data.get("extinct", [])}

    # ── Bateaux ───────────────────────────────────────────────
    print(f"── Bateaux ({len(data['endangered'])} existants) ──")
    for nom, nom_en, sci, code, desc in BOATS_TO_ADD:
        if nom in existing_boats or nom_en in existing_boats:
            print(f"  · {nom} — déjà présent")
            continue
        data = add_endangered(nom, nom_en, sci, code, desc, data=data, save=False)
        existing_boats.add(nom)
        existing_boats.add(nom_en)
        time.sleep(1.2)

    # ── Arche ─────────────────────────────────────────────────
    print(f"\n── Arche ({len(data['extinct'])} existants) ──")
    for sp in ARK_TO_ADD:
        nom = sp["nom"]
        if nom in existing_ark:
            print(f"  · {nom} — déjà présente")
            continue
        data = add_extinct(nom, sp["date"], sp["description"], data=data, save=False)
        existing_ark.add(nom)
        time.sleep(1.5)

    _save(data)
    print(f"\n✅ Terminé — {len(data['endangered'])} bateaux, {len(data['extinct'])} dans l'Arche")


# ── IUCN SYNC ─────────────────────────────────────────────────

def iucn_get(path, params=None):
    headers = {"Authorization": f"Bearer {IUCN_KEY}"}
    r = requests.get(f"{IUCN_BASE}{path}", headers=headers, params=params or {})
    if r.status_code != 200:
        raise Exception(f"IUCN API {r.status_code}: {r.text[:200]}")
    return r.json()


def sync_iucn():
    """Synchronise les statuts depuis l'IUCN Red List API v4."""
    print("\n🌊 Sunken Noah — Sync IUCN\n")
    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)

    SCIENTIFIC = {
        "Rhinocéros de Java": ("Rhinoceros","sondaicus"),
        "Vaquita marina":     ("Phocoena","sinus"),
        "Tigre de Sumatra":   ("Panthera","tigris"),
        "Gorille de montagne":("Gorilla","beringei"),
        "Éléphant de forêt d'Afrique":("Loxodonta","cyclotis"),
        "Dugong":             ("Dugong","dugon"),
        "Requin-baleine":     ("Rhincodon","typus"),
        "Tortue luth":        ("Dermochelys","coriacea"),
        "Pangolin de Chine":  ("Manis","pentadactyla"),
        "Lémurien de Coquerel":("Propithecus","coquereli"),
        "Albatros hurleur":   ("Diomedea","exulans"),
        "Orang-outan de Tapanuli":("Pongo","tapanuliensis"),
        "Okapi":              ("Okapia","johnstoni"),
        "Mérou bagnard":      ("Epinephelus","striatus"),
        "Condor de Californie":("Gymnogyps","californianus"),
        "Saïga":              ("Saiga","tatarica"),
        "Cœlacanthe":         ("Latimeria","chalumnae"),
        "Lynx ibérique":      ("Lynx","pardinus"),
        "Hippopotame nain":   ("Choeropsis","liberiensis"),
        "Aye-aye":            ("Daubentonia","madagascariensis"),
        "Rhinocéros noir":    ("Diceros","bicornis"),
        "Léopard des neiges": ("Panthera","uncia"),
        "Tapir de Baird":     ("Tapirus","bairdii"),
        "Requin pèlerin":     ("Cetorhinus","maximus"),
        "Macaque de Barbarie":("Macaca","sylvanus"),
    }

    updated = 0
    for sp in data.get("endangered", []):
        sci = SCIENTIFIC.get(sp["name"])
        if not sci or sp.get("status_manual"):
            continue
        try:
            res = iucn_get("/taxa/scientific_name", {"genus_name": sci[0], "species_name": sci[1]})
            assessments = res.get("assessments", [])
            if not assessments:
                continue
            latest = next((a for a in assessments if a.get("latest")), assessments[0])
            code = latest.get("red_list_category_code","")
            if code and IUCN_DANGER.get(code):
                sp["danger"] = IUCN_DANGER[code]
                sp["iucn"] = {
                    "iucn_status_code": code,
                    "iucn_year": latest.get("year_published",""),
                    "iucn_url":  latest.get("url",""),
                }
                updated += 1
                print(f"  ✓ {sp['name']} → {code}")
            time.sleep(0.5)
        except Exception as e:
            print(f"  ⚠ {sp['name']}: {e}")

    data["endangered"].sort(key=lambda s: s.get("danger", 0), reverse=True)
    data.setdefault("meta",{})["last_iucn_sync"] = time.strftime("%Y-%m-%d")
    _save(data)
    print(f"\n✓ {updated} statuts mis à jour.")


# ── PHOTOS WIKIPEDIA ──────────────────────────────────────────

WIKI_HEADERS = {"User-Agent": "SunkenNoah/1.0 python-requests"}
BAD_TOKENS   = ["map","range","distribution","chart","tree","clade","phylo",
                 "taxonomy","skeleton","fossil","skull","logo","icon","flag",
                 "coat","arms","stamp","diagram","infograph","timeline"]

def _is_bad(filename):
    fn = filename.lower()
    return any(t in fn for t in BAD_TOKENS)

def _commons_search(query, limit=10):
    try:
        r = requests.get("https://commons.wikimedia.org/w/api.php", params={
            "action":"query","generator":"search","gsrnamespace":6,
            "gsrsearch":f'"{query}" filetype:bitmap',"gsrlimit":limit,
            "prop":"imageinfo","iiprop":"url|mime|size","iiurlwidth":800,"format":"json",
        }, headers=WIKI_HEADERS, timeout=12)
        pages = r.json().get("query",{}).get("pages",{})
        results = []
        for p in pages.values():
            title = p.get("title","")
            if _is_bad(title): continue
            ii = p.get("imageinfo",[{}])[0]
            if not ii.get("mime","").startswith("image/"): continue
            w, h = ii.get("thumbwidth",0), ii.get("thumbheight",0)
            if w < 300 or h < 200: continue
            if w > 0 and h > 0 and (w/h > 4 or h/w > 4): continue
            url = ii.get("thumburl") or ii.get("url")
            if url: results.append(url)
        return results
    except Exception:
        return []

def _wiki_image(title, lang='fr'):
    try:
        r = requests.get(f"https://{lang}.wikipedia.org/w/api.php", params={
            "action":"query","titles":title,"prop":"pageimages",
            "format":"json","pithumbsize":800,
        }, headers=WIKI_HEADERS, timeout=10)
        for p in r.json().get("query",{}).get("pages",{}).values():
            url = p.get("thumbnail",{}).get("source")
            if url and not _is_bad(url): return url
    except Exception:
        pass
    return None

def fetch_photo(nom):
    results = _commons_search(nom)
    if results: return results[0]
    url = _wiki_image(nom, 'fr')
    if url: return url
    return _wiki_image(nom, 'en')

def fetch_all_photos(force=False):
    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)
    updated = 0
    for group in ("endangered","extinct"):
        for sp in data.get(group,[]):
            if sp.get("photo_manual"): continue
            if sp.get("photo_url") and not force: continue
            print(f"  → {sp['name']}...", end=" ", flush=True)
            url = fetch_photo(sp["name"])
            if url:
                sp["photo_url"] = url
                updated += 1
                print("✓")
            else:
                print("✗")
            time.sleep(0.4)
    _save(data)
    print(f"\n✓ {updated} photos ajoutées.")


# ── UTILS ─────────────────────────────────────────────────────

def _save(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ── BATCH (liste manuelle) ────────────────────────────────────

SPECIES_LIST = [
    # Ajouter ici des espèces éteintes manuellement si besoin
]


# ── MAIN ──────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n🌊 Sunken Noah — Agent IA\n")

    if "--populate" in sys.argv:
        populate_all()
    elif "--generate-images" in sys.argv:
        generate_missing_images()
    elif "--fetch-photos" in sys.argv:
        force = "--force" in sys.argv
        fetch_all_photos(force=force)
    elif "--sync-iucn" in sys.argv:
        sync_iucn()
    elif len(sys.argv) >= 4:
        add_extinct(sys.argv[1], sys.argv[2], sys.argv[3])
    else:
        if not SPECIES_LIST:
            print("  Aucune espèce dans SPECIES_LIST. Utilise --populate pour tout remplir.")
            sys.exit(0)
        print(f"  Batch : {len(SPECIES_LIST)} espèces\n")
        for sp in SPECIES_LIST:
            add_extinct(sp["nom"], sp["date"], sp["description"])
        print("✓ Batch terminé !")
