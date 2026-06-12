import requests
import json
import re
import time
import hashlib
import os

def extract_traits(wikitext):
    """Scans the English lore and attack descriptions to assign AI tags."""
    traits = set()
    
    # Trait Dictionary: Key is the Tag, Values are the trigger words
    trait_map = {
        # --- Elements & Magic ---
        "Fire": ["fire", "flame", "burn", "magma", "blaze", "volcano", "heat", "inferno"],
        "Water/Ice": ["water", "ice", "snow", "freeze", "ocean", "sea", "aqua", "blizzard", "frost", "cold"],
        "Plant/Nature": ["plant", "tree", "flower", "leaf", "nature", "wood", "forest", "vine", "grass", "seed"],
        "Electric": ["electric", "thunder", "lightning", "spark", "volt", "plasma", "shock"],
        "Holy/Light": ["holy", "angel", "light", "sacred", "divine", "heaven", "celestial", "purify", "priest"],
        "Dark/Demonic": ["dark", "evil", "demon", "devil", "shadow", "nightmare", "hell", "virus", "wicked", "abyss"],
        "Earth/Sand": ["earth", "rock", "stone", "sand", "desert", "golem", "mud", "crystal"],
        "Wind/Air": ["wind", "air", "storm", "tornado", "gale", "hurricane", "gust"],

        # --- Species / Themes ---
        "Dragon/Reptile": ["dragon", "dinosaur", "reptile", "dramon", "serpent", "wyvern", "saur"],
        "Beast/Animal": ["beast", "animal", "wolf", "dog", "cat", "lion", "bird", "avian", "fox", "bear", "tiger", "mammal"],
        "Machine/Metal": ["machine", "cyborg", "metal", "robot", "mechanical", "steel", "gear", "android", "chrome digizoid"],
        "Aquatic": ["aquatic", "fish", "shark", "whale", "swimming", "submarine", "diver", "jellyfish"],
        "Bug/Insect": ["bug", "insect", "spider", "beetle", "butterfly", "mantis", "bee", "wasp"],
        "Mutant/Slime": ["mutant", "slime", "poop", "garbage", "trash", "filth", "sewage"],
        
        # --- Body Types & Wearables ---
        "Flying": ["fly", "flying", "wings", "sky", "airborne", "wing"],
        "Bipedal": ["two legs", "bipedal", "walks on two legs", "stand on two legs"],
        "Quadruped": ["four legs", "quadruped", "walks on four legs", "beast form"],
        "Humanoid": ["humanoid", "human-like", "bipedal human", "man-machine", "warrior figure", "fairy"],
        "Armored": ["armor", "helmet", "shield", "clad in", "armour", "carapace"],

        # --- Combat Style / Weapons ---
        "Melee/Bladed": ["sword", "blade", "katana", "knife", "slash", "cut", "samurai", "ninja", "spear", "lance"],
        "Ranged/Firearms": ["gun", "cannon", "sniper", "missile", "shoot", "blaster", "revolver", "artillery", "gatling"],
        "Brawler": ["punch", "kick", "boxing", "wrestling", "martial arts", "fist", "grapple", "combat"],

        # --- Colors ---
        # Note: Colors are broad, so we use slightly more specific trigger words where possible
        "Color: Black/Dark": ["black", "dark colored", "obsidian", "ebony"],
        "Color: Red/Crimson": ["red", "crimson", "scarlet", "ruby", "red-colored"],
        "Color: Blue/Azure": ["blue", "azure", "cerulean", "sapphire", "cyan"],
        "Color: Yellow/Gold": ["yellow", "gold", "golden", "blonde"],
        "Color: White/Silver": ["white", "silver", "pale", "snow white", "platinum"],
        "Color: Green": ["green", "emerald", "jade", "viridian"],
        "Color: Pink/Purple": ["pink", "purple", "violet", "magenta"],

        "Human Spirit": ["Human Spirit"],
        "Beast Spirit": ["Beast Spirit"],
        "Fusion Spirit": ["Fusion Spirit"],
        "Transcendent Spirit": ["Transcendent Spirit"]
    }
    
    # Isolate only the English Profiles (|pe=) and Attack Descriptions (|desc=)
    # This prevents triggering false positives from card game trivia
    profile_texts = re.findall(r'\|pe[0-9a-z]*=([^\n]+)', wikitext, re.IGNORECASE)
    attack_texts = re.findall(r'\|desc[0-9a-z]*=([^\n]+)', wikitext, re.IGNORECASE)
    
    combined_text = " ".join(profile_texts + attack_texts).lower()
    
    for trait, keywords in trait_map.items():
        for keyword in keywords:
            # Use regex \b to match exact words only (so "cat" doesn't match "catch")
            if re.search(r'\b' + re.escape(keyword) + r'\b', combined_text):
                traits.add(trait)
                break # Move to the next category once we confirm a match
                
    return sorted(list(traits))

def load_blacklist():
    if os.path.exists("blacklist.json"):
        with open("blacklist.json", "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()

def save_blacklist(blacklist_set):
    with open("blacklist.json", "w", encoding="utf-8") as f:
        json.dump(sorted(list(blacklist_set)), f, indent=4)

def get_english_mapping():
    url = "https://wikimon.net/api.php"
    params = {"action": "query", "prop": "revisions", "rvprop": "content", "titles": "List of English Dub Names", "format": "json"}
    response = requests.get(url, params=params)
    wikitext = list(response.json().get("query", {}).get("pages", {}).values())[0].get("revisions", [{}])[0].get("*", "")
    
    mapping = {}
    blocks = re.findall(r'\{\{DlistE\s*(.*?)\}\}', wikitext, re.DOTALL)
    for block in blocks:
        n_match = re.search(r'\|n=([^\n]+)', block)
        j_match = re.search(r'\|j=([^\n]+)', block)
        if n_match and j_match:
            english_name = n_match.group(1).strip()
            for j_name in j_match.group(1).split('<br>'):
                mapping[j_name.strip()] = english_name
    return mapping

def get_all_digimon_names():
    url = "https://wikimon.net/api.php"
    params = {"action": "query", "prop": "revisions", "rvprop": "content", "titles": "List of Digimon", "format": "json"}
    response = requests.get(url, params=params)
    wikitext = list(response.json().get("query", {}).get("pages", {}).values())[0].get("revisions", [{}])[0].get("*", "")
    
    clean_names = set()
    # Find all data blocks for individual Digimon
    blocks = re.findall(r'\{\{DlistJ\s*(.*?)\}\}', wikitext, re.DOTALL)
    
    for block in blocks:
        name_match = re.search(r'\|n=([^|\n]+)', block)
        debut_match = re.search(r'\|d=([^\n]+)', block)
        
        if name_match:
            name = name_match.group(1).strip().split("{{!}}")[0]
            debut_text = debut_match.group(1) if debut_match else ""
            
            # FILTRATION: Drop manga-specific vehicles, unreleased data, and obscure Chinese game exclusives
            if "Unnamed" in name or "Unreleased" in debut_text or "Legendary Skies" in debut_text:
                continue
                
            clean_names.add(name)
            
    return sorted(list(clean_names))

def generate_mediawiki_image_url(filename):
    """Instantly calculates the raw image URL using MediaWiki's MD5 structure."""
    filename = filename.strip().replace(" ", "_")
    # MediaWiki capitalizes the very first letter for the hash
    filename = filename[0].upper() + filename[1:] if filename else filename
    md5_hash = hashlib.md5(filename.encode('utf-8')).hexdigest()
    return f"https://wikimon.net/images/{md5_hash[0]}/{md5_hash[0:2]}/{filename}"

def fetch_wikimon_batch(titles_batch, english_mapping):
    """Fetches up to 50 Digimon at the exact same time."""
    url = "https://wikimon.net/api.php"
    params = {
        "action": "query",
        "prop": "revisions",
        "rvprop": "content",
        "titles": "|".join(titles_batch), # Joins 50 names with a pipe
        "format": "json",
        "redirects": 1
    }
    
    response = requests.get(url, params=params)
    pages = response.json().get("query", {}).get("pages", {})
    
    parsed_results = []
    for page_id, page_content in pages.items():
        if page_id == "-1": continue
            
        canonical_name = page_content.get("title")
        wikitext = page_content.get("revisions", [{}])[0].get("*", "")
        english_name = english_mapping.get(canonical_name, canonical_name)
        
        parsed_data = parse_wikitext(canonical_name, english_name, wikitext)
        if parsed_data:
            parsed_results.append(parsed_data)
            
    return parsed_results

def parse_wikitext(name, english_name, wikitext):
    # QUALITY FILTER: Drop Manga Characters and Empty Fusions
    if re.search(r'^\s*\{\{Char', wikitext, re.IGNORECASE): return None
        
    digimon_entry = {
        "name": name,
        "english_name": english_name, 
        "image_url": None, 
        "level": None,
        "attribute": None,
        "type": None,
        "group": None,
        "fields": [],
        "traits": [], # Will be populated by extract_traits
        "evolves_from": [],
        "evolves_to": []
    }
    
    image_match = re.search(r'\|image=([^|\n]+)', wikitext)
    if image_match:
        img_filename = re.sub(r'', '', image_match.group(1)).strip()
        if img_filename:
            digimon_entry["image_url"] = generate_mediawiki_image_url(img_filename)
    
    level_match = re.search(r'\|l1=([^|\n]+)', wikitext)
    if level_match: digimon_entry["level"] = level_match.group(1).strip()
        
    attr_match = re.search(r'\|a1=([^|\n]+)', wikitext)
    if attr_match: digimon_entry["attribute"] = attr_match.group(1).strip()
        
    type_match = re.search(r'\|t1=([^|\n]+)', wikitext)
    if type_match: digimon_entry["type"] = type_match.group(1).strip()

    group_match = re.search(r'\|g1=([^|\n]+)', wikitext)
    if group_match: digimon_entry["group"] = group_match.group(1).strip()

    # QUALITY FILTER: If there is no Type or Attribute, it's a junk placeholder
    if not digimon_entry["type"] and not digimon_entry["attribute"]: return None
        
    field_matches = re.findall(r'\|f\d+=([^|\n]+)', wikitext)
    for field in field_matches:
        clean_field = re.sub(r'[\[\]{}]', '', field.split('<')[0]).strip()
        if clean_field: digimon_entry["fields"].append(clean_field)
        
    evolves_from_section = re.search(r'==\s*Evolves From\s*==(.*?)(?=\n==[A-Z]|$)', wikitext, re.DOTALL)
    if evolves_from_section:
        digimon_entry["evolves_from"] = extract_digimon_links(evolves_from_section.group(1))
        
    evolves_to_section = re.search(r'==\s*Evolves To\s*==(.*?)(?=\n==[A-Z]|$)', wikitext, re.DOTALL)
    if evolves_to_section:
        digimon_entry["evolves_to"] = extract_digimon_links(evolves_to_section.group(1))
    
    digimon_entry["traits"] = extract_traits(wikitext)
    
    # --- NEW: HYBRID SPIRIT CLASS SCANNER ---
    # This checks for Hybrid Spirit mentions and adds them as traits
    spirit_match = re.search(r'(Human|Beast|Fusion|Transcendent)\s+Spirit', wikitext, re.IGNORECASE)
    if spirit_match:
        spirit_trait = f"{spirit_match.group(1).title()} Spirit"
        if spirit_trait not in digimon_entry["traits"]:
            digimon_entry["traits"].append(spirit_trait)

    return digimon_entry

def extract_digimon_links(section_text):
    digimon_set = set()
    links = re.findall(r'^\*+\s*\'*\[\[(.*?)\]\]', section_text, re.MULTILINE)
    blacklist = ["Colors and Levels", "Card Game", "Battle Spirits", "Any ", "Evolution"]
    
    for link in links:
        actual_name = link.split('|')[0].strip()
        if not any(b in actual_name for b in blacklist) and "#" not in actual_name:
            digimon_set.add(actual_name)
    return sorted(list(digimon_set))

def main():
    db_filename = "digimon_db.json"
    database = []
    existing_names = set()

    blacklist = load_blacklist() # Load the skipped Digimon
    
    # DELTA CACHING: Load existing DB if it exists
    if os.path.exists(db_filename):
        with open(db_filename, "r", encoding="utf-8") as f:
            database = json.load(f)
            existing_names = {mon["name"] for mon in database}
        print(f"Loaded {len(database)} Digimon from local cache.")

    english_mapping = get_english_mapping()
    master_list = get_all_digimon_names()
    
    # Filter out Digimon we already have and those in the blacklist
    missing_digimon = [mon for mon in master_list if mon not in existing_names and mon not in blacklist]
    print(f"Found {len(missing_digimon)} NEW Digimon to fetch.")
    
    if not missing_digimon:
        print("Database is already up to date!")
        return

    # BATCH PROCESSING: Grab 50 at a time
    batch_size = 50
    for i in range(0, len(missing_digimon), batch_size):
        batch = missing_digimon[i : i + batch_size]
        print(f"Fetching batch {i+1} to {min(i+batch_size, len(missing_digimon))}...")
        
        results = fetch_wikimon_batch(batch, english_mapping)
        database.extend(results)
        
        for canonical_name in batch:
            # If the parser returned None, it's junk data. Blacklist it!   
            if not any(d["name"] == canonical_name for d in results):
                blacklist.add(canonical_name)

        # Save incrementally just in case it crashes
        with open(db_filename, "w", encoding="utf-8") as f:
            json.dump(database, f, indent=4, ensure_ascii=False)
        save_blacklist(blacklist)    
            
        time.sleep(1) # Be polite to the server between big batches
    print("\nSuccess! Database fully updated.")

if __name__ == "__main__":
    main()