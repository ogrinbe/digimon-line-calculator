import requests
import json
import re
import time
import hashlib
import os
import base64
import tempfile


# ==========================================
# 1. THE MASTER TRAIT DICTIONARY
# ==========================================

MASTER_TRAIT_MAP = {
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
    "Dragon/Reptile": ["dragon", "dinosaur", "reptile", "dramon", "serpent", "wyvern", "saur", "dino"],
    "Beast/Animal": ["beast", "animal", "wolf", "dog", "cat", "lion", "bird", "avian", "fox", "bear", "tiger", "mammal"],
    "Machine/Metal": ["machine", "cyborg", "metal", "robot", "mechanical", "steel", "gear", "android", "chrome digizoid"],
    "Aquatic": ["aquatic", "fish", "shark", "whale", "swimming", "submarine", "diver", "jellyfish", "seafood"],
    "Bug/Insect": ["bug", "insect", "spider", "beetle", "butterfly", "mantis", "bee", "wasp"],
    "Mutant/Slime": ["mutant", "slime", "poop", "garbage", "trash", "filth", "sewage", "numemon", "sukamon"],
    "Undead/Ghost": ["undead", "ghost", "zombie", "vampire", "skeleton", "bone", "phantom", "spirit"], # NEW!

    # --- Body Types & Wearables ---
    "Flying": ["fly", "flying", "wings", "sky", "airborne", "wing"],
    "Bipedal": ["two legs", "bipedal", "walks on two legs", "stand on two legs", "upright"],
    "Quadruped": ["four legs", "quadruped", "walks on four legs", "beast form", "on all fours"],
    "Humanoid": ["humanoid", "human-like", "bipedal human", "man-machine", "warrior figure", "fairy"],
    "Armored": ["armor", "helmet", "shield", "clad in", "armour", "carapace"],

    # --- Combat Style / Weapons ---
    "Melee/Bladed": ["sword", "blade", "katana", "knife", "slash", "cut", "samurai", "ninja", "spear", "lance"],
    "Ranged/Firearms": ["gun", "cannon", "sniper", "missile", "shoot", "blaster", "revolver", "artillery", "gatling"],
    "Brawler": ["punch", "kick", "boxing", "wrestling", "martial arts", "fist", "grapple", "combat"],

    # --- Colors ---
    "Color: Black/Dark": ["black", "dark colored", "obsidian", "ebony"],
    "Color: Red/Crimson": ["red", "crimson", "scarlet", "ruby", "red-colored"],
    "Color: Blue/Azure": ["blue", "azure", "cerulean", "sapphire", "cyan"],
    "Color: Yellow/Gold": ["yellow", "gold", "golden", "blonde"],
    "Color: White/Silver": ["white", "silver", "pale", "snow white", "platinum"],
    "Color: Green": ["green", "emerald", "jade", "viridian"],
    "Color: Pink/Purple": ["pink", "purple", "violet", "magenta"],
    "Color: Orange/Brown": ["orange", "brown", "tan", "copper", "bronze", "rust"], # NEW!

    # --- Special ---
    "Human Spirit": ["Human Spirit"],
    "Beast Spirit": ["Beast Spirit"],
    "Fusion Spirit": ["Fusion Spirit"],
    "Transcendent Spirit": ["Transcendent Spirit"],
    "X-Antibody": ["X-Antibody", "X-Evolution", "Omega inForce"] # NEW!
}

# Automatically generate the flat list for the LLMs so you never have to type it twice
TRAIT_LIST = list(MASTER_TRAIT_MAP.keys())

def extract_traits_regex(raw_text):
    """The lightning-fast keyword scraper."""
    traits = set()
    combined_text = raw_text.lower()
    
    for trait, keywords in MASTER_TRAIT_MAP.items():
        for keyword in keywords:
            if re.search(r'\b' + re.escape(keyword.lower()) + r'\b', combined_text):
                traits.add(trait)
                break 
                
    return sorted(list(traits))

def call_ollama(model, prompt, image_url=None):
    """Handles communication with your local Ollama instance with deep debugging."""
    try:
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            # Temporarily disabled to see what LLaVA naturally wants to output
            # "format": "json" 
        }
        
        if image_url and model == "llava":
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            response = requests.get(image_url, headers=headers)
            
            if response.status_code == 200:
                # Check if Wikimon actually sent an image, not an HTML error page
                content_type = response.headers.get('Content-Type', '')
                if 'image' not in content_type:
                    print(f"  [!] Wikimon blocked us. Sent {content_type} instead of an image.")
                    return []
                
                payload["images"] = [base64.b64encode(response.content).decode('utf-8')]
                print(f"  [*] Image loaded successfully. Size: {len(payload['images'][0])} bytes")
            else:
                print(f"  [!] Failed to download image. HTTP Status: {response.status_code}")
                return []

        print(f"  [*] Waiting for {model} to analyze... (this can take a moment)")
        
        # Increased timeout to 120s just in case LLaVA is taking a while to load into VRAM
        response = requests.post("http://localhost:11434/api/generate", json=payload, timeout=120)
        
        if response.status_code != 200:
            print(f"  [!] Ollama API Error: {response.status_code} - {response.text}")
            return []

        ai_reply = response.json().get("response", "").strip()
        
        # === THE SMOKING GUN ===
        # === THE SMOKING GUN ===
        # (You can delete these print statements now if you want a cleaner terminal)
        print(f"\n--- RAW AI OUTPUT START ---")
        print(ai_reply)
        print(f"--- RAW AI OUTPUT END ---\n")

        # 1. Try to parse it as JSON
        try:
            parsed = json.loads(ai_reply)
            extracted_traits = []
            
            if isinstance(parsed, dict):
                # If LLaVA makes up categories like {"Body Type": ["..."], "Visuals": ["..."]}
                # or if it correctly uses {"traits": ["..."]}
                for value in parsed.values():
                    if isinstance(value, list):
                        extracted_traits.extend(value)
                    elif isinstance(value, str):
                        extracted_traits.append(value)
                return extracted_traits
                
            elif isinstance(parsed, list):
                # If it actually listened and sent a flat array
                return parsed
                
        except json.JSONDecodeError:
            # 2. FALLBACK: Find ALL arrays in the text, not just the first one
            extracted_traits = []
            matches = re.findall(r'\[(.*?)\]', ai_reply, re.DOTALL)
            for match in matches:
                clean_array = re.sub(r',\s*\]', ']', f"[{match}]")
                try:
                    extracted_traits.extend(json.loads(clean_array))
                except:
                    pass
            return extracted_traits
            
        print("  [!] Script could not parse any traits from the output above.")
        return []
        
    except Exception as e:
        print(f"  [!] System Error on {model}: {e}")
        return []

def extract_traits_ai(name, raw_text, model):
    """Prompts LLaMA 3 or Phi-3 to analyze text and return traits."""
    prompt = f"""
    You are a Digimon expert. Read this profile for {name}.
    Based ONLY on this text, return traits from this exact list:
    {TRAIT_LIST}
    
    Return ONLY a JSON object in this exact format:
    {{"traits": ["Trait1", "Trait2"]}}
    
    Profile: {raw_text[:1500]} 
    """
    return call_ollama(model, prompt)

def extract_traits_vision(name, image_url):
    """Prompts LLaVA to look at the image with strict morphological rules."""
    prompt = f"""
    You are a Digimon anatomy and design expert. Look at the official artwork for {name}.
    Based ONLY on its appearance in this specific image, select traits from this exact list:
    {TRAIT_LIST}
    
    Follow these strict rules:
    1. BODY TYPE: Look at the limbs. If the Digimon has arms with distinct hands/fingers/claws used for grasping or fighting, it is "Bipedal" or "Humanoid", even if it is crouching. Only use "Quadruped" if it stands on four distinct animal-like paws or hooves.
    2. COLORS: Identify the 1 or 2 most dominant colors on its body and select the matching "Color: [X]" tags.
    3. VISUALS: Does it have wings (Flying)? Does it hold a sword (Melee) or a gun (Ranged)? Is it wearing armor?
    
    Return ONLY a valid JSON array of strings. 
    Example output: ["Bipedal", "Color: Blue/Azure", "Color: White/Silver", "Dragon/Reptile", "Flying"]
    """
    return call_ollama("llava", prompt, image_url)


# ==========================================
# 2. WIKIMON SCRAPER LOGIC
# ==========================================

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
            for j_name in j_match.group(1).split('<br>'): mapping[j_name.strip()] = english_name
    return mapping

def get_all_digimon_names():
    url = "https://wikimon.net/api.php"
    params = {"action": "query", "prop": "revisions", "rvprop": "content", "titles": "List of Digimon", "format": "json"}
    response = requests.get(url, params=params)
    wikitext = list(response.json().get("query", {}).get("pages", {}).values())[0].get("revisions", [{}])[0].get("*", "")
    clean_names = set()
    blocks = re.findall(r'\{\{DlistJ\s*(.*?)\}\}', wikitext, re.DOTALL)
    for block in blocks:
        name_match = re.search(r'\|n=([^|\n]+)', block)
        debut_match = re.search(r'\|d=([^\n]+)', block)
        if name_match:
            name = name_match.group(1).strip().split("{{!}}")[0]
            debut_text = debut_match.group(1) if debut_match else ""
            if "Unnamed" in name or "Unreleased" in debut_text or "Legendary Skies" in debut_text: continue
            clean_names.add(name)
    return sorted(list(clean_names))

def extract_digimon_links(section_text):
    digimon_set = set()
    links = re.findall(r'^\*+\s*\'*\[\[(.*?)\]\]', section_text, re.MULTILINE)
    blacklist = ["Colors and Levels", "Card Game", "Battle Spirits", "Any ", "Evolution"]
    for link in links:
        actual_name = link.split('|')[0].strip()
        if not any(b in actual_name for b in blacklist) and "#" not in actual_name:
            digimon_set.add(actual_name)
    return sorted(list(digimon_set))

def parse_wikitext(name, english_name, wikitext):
    if re.search(r'^\s*\{\{Char', wikitext, re.IGNORECASE): return None
        
    digimon = {
        "name": name, "english_name": english_name, "image_url": None, 
        "level": None, "attribute": None, "type": None, "group": None, 
        "fields": [], "traits": [], "raw_text": "", "evolves_from": [], "evolves_to": [],
        "ai_vision_processed": False, # <-- NEW FLAG
        "ai_text_processed": False    # <-- NEW FLAG
    }
    
    image_match = re.search(r'\|image=([^|\n]+)', wikitext)
    if image_match:
        img_filename = re.sub(r'<\/?.*?_?>', '', image_match.group(1)).strip().replace(" ", "_")
        img_filename = img_filename[0].upper() + img_filename[1:] if img_filename else img_filename
        md5_hash = hashlib.md5(img_filename.encode('utf-8')).hexdigest()
        digimon["image_url"] = f"https://wikimon.net/images/{md5_hash[0]}/{md5_hash[0:2]}/{img_filename}"
    
    level_match = re.search(r'\|l1=([^|\n]+)', wikitext)
    if level_match: digimon["level"] = level_match.group(1).strip()
    attr_match = re.search(r'\|a1=([^|\n]+)', wikitext)
    if attr_match: digimon["attribute"] = attr_match.group(1).strip()
    type_match = re.search(r'\|t1=([^|\n]+)', wikitext)
    if type_match: digimon["type"] = type_match.group(1).strip()
    
    if not digimon["type"] and not digimon["attribute"]: return None

    profile_texts = re.findall(r'\|pe[0-9a-z]*=([^\n]+)', wikitext, re.IGNORECASE)
    attack_texts = re.findall(r'\|desc[0-9a-z]*=([^\n]+)', wikitext, re.IGNORECASE)
    digimon["raw_text"] = " ".join(profile_texts + attack_texts)

    digimon["traits"] = extract_traits_regex(digimon["raw_text"])
    
    evolves_from_sec = re.search(r'==\s*Evolves From\s*==(.*?)(?=\n==[A-Z]|$)', wikitext, re.DOTALL)
    if evolves_from_sec: digimon["evolves_from"] = extract_digimon_links(evolves_from_sec.group(1))
    evolves_to_sec = re.search(r'==\s*Evolves To\s*==(.*?)(?=\n==[A-Z]|$)', wikitext, re.DOTALL)
    if evolves_to_sec: digimon["evolves_to"] = extract_digimon_links(evolves_to_sec.group(1))

    return digimon

def fetch_wikimon_batch(titles_batch, english_mapping):
    url = "https://wikimon.net/api.php"
    params = {"action": "query", "prop": "revisions", "rvprop": "content", "titles": "|".join(titles_batch), "format": "json", "redirects": 1}
    response = requests.get(url, params=params)
    pages = response.json().get("query", {}).get("pages", {})
    
    results = []
    for page_id, page_content in pages.items():
        if page_id == "-1": continue
        canonical_name = page_content.get("title")
        wikitext = page_content.get("revisions", [{}])[0].get("*", "")
        english_name = english_mapping.get(canonical_name, canonical_name)
        
        parsed = parse_wikitext(canonical_name, english_name, wikitext)
        if parsed: results.append(parsed)
    return results

# ==========================================
# 3. CLI MENU & DATA MANAGEMENT
# ==========================================

def load_db():
    if os.path.exists('digimon_db.json'):
        with open('digimon_db.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_db(data):
    # 1. Deduplicate the database by the Digimon's name!
    unique_dict = {}
    for mon in data:
        unique_dict[mon["name"]] = mon
    clean_data = list(unique_dict.values())
    
    # 2. Save the clean data
    with open('digimon_db.json', 'w', encoding='utf-8') as f:
        json.dump(clean_data, f, indent=4, ensure_ascii=False)
    print(f"\n✅ Saved {len(clean_data)} unique Digimon successfully!")

def load_blacklist():
    if os.path.exists("blacklist.json"):
        with open("blacklist.json", "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()

def save_blacklist(blacklist_set):
    with open("blacklist.json", "w", encoding="utf-8") as f:
        json.dump(sorted(list(blacklist_set)), f, indent=4)

def run_scraper(db, force_rebuild=False):
    existing_names = {mon["name"] for mon in db} if not force_rebuild else set()
    blacklist = load_blacklist() if not force_rebuild else set()
    
    english_mapping = get_english_mapping()
    master_list = get_all_digimon_names()
    
    # Filter out Digimon we already have AND those in the blacklist
    missing_digimon = [mon for mon in master_list if mon not in existing_names and mon not in blacklist]
    print(f"Found {len(missing_digimon)} Digimon to fetch...")
    
    if not missing_digimon: return db

    batch_size = 50
    for i in range(0, len(missing_digimon), batch_size):
        batch = missing_digimon[i : i + batch_size]
        print(f"Fetching batch {i+1} to {min(i+batch_size, len(missing_digimon))}...")
        
        results = fetch_wikimon_batch(batch, english_mapping)
        db.extend(results)
        
        # BLACKLIST CHECK: If the parser returned None, it's junk data.
        for canonical_name in batch:
            if not any(d["name"] == canonical_name for d in results):
                blacklist.add(canonical_name)
                
        time.sleep(1)
        
    save_db(db)
    save_blacklist(blacklist) # Save the junk items so we never check them again
    return db

def trait_assignment_menu(db):
    print("\n--- TRAIT ENHANCEMENT ENGINE ---")
    print("a. LLaVA (Vision) - Scan Images for Body Types/Weapons")
    print("b. LLaMA 3 (Text) - Deep Lore Analysis (Heavy)")
    print("c. Phi-3 (Text) - Fast Lore Analysis (Light)")
    print("d. RegEx Only - Reset to Fast Keyword System")
    print("e. THE MASTER PIPELINE (Run LLaVA Vision + LLaMA 3 Text)")
    
    choice = input("Select an engine (a/b/c/d/e): ").lower().strip()
    if choice not in ['a', 'b', 'c', 'd', 'e']: return
    
    for i, mon in enumerate(db):
        # BACKWARD COMPATIBILITY: Add flags if they don't exist in older JSON saves
        if "ai_vision_processed" not in mon: mon["ai_vision_processed"] = False
        if "ai_text_processed" not in mon: mon["ai_text_processed"] = False

        print(f"[{i+1}/{len(db)}] Processing {mon['name']}...")
        
        current_traits = set(mon.get("traits", []))
        new_traits = []
        
        # --- THE MASTER PIPELINE ---
        if choice == 'e':
            if mon.get("image_url") and not mon["ai_vision_processed"]:
                print("  [*] Running Vision Analysis...")
                new_traits.extend(extract_traits_vision(mon["name"], mon["image_url"]))
                mon["ai_vision_processed"] = True
            elif mon["ai_vision_processed"]:
                print("  [*] Vision Analysis already complete, skipping...")

            if mon.get("raw_text") and not mon["ai_text_processed"]:
                print("  [*] Running Text Analysis...")
                new_traits.extend(extract_traits_ai(mon["name"], mon["raw_text"], "llama3"))
                mon["ai_text_processed"] = True
            elif mon["ai_text_processed"]:
                print("  [*] Text Analysis already complete, skipping...")
                
        # --- INDIVIDUAL OPTIONS ---
        elif choice == 'a':
            if mon.get("image_url") and not mon["ai_vision_processed"]:
                new_traits = extract_traits_vision(mon["name"], mon["image_url"])
                mon["ai_vision_processed"] = True
            else:
                print("  [*] Vision Analysis skipped (already processed or no image).")
                
        elif choice == 'b':
            if mon.get("raw_text") and not mon["ai_text_processed"]:
                new_traits = extract_traits_ai(mon["name"], mon["raw_text"], "llama3")
                mon["ai_text_processed"] = True
            else:
                print("  [*] Text Analysis skipped (already processed or no text).")
                
        elif choice == 'c':
            if mon.get("raw_text") and not mon["ai_text_processed"]:
                new_traits = extract_traits_ai(mon["name"], mon["raw_text"], "phi3")
                mon["ai_text_processed"] = True
            else:
                print("  [*] Text Analysis skipped (already processed or no text).")
                
        elif choice == 'd':
            current_traits = set(extract_traits_regex(mon.get("raw_text", "")))
            # Reset flags if user manually downgrades to RegEx
            mon["ai_vision_processed"] = False
            mon["ai_text_processed"] = False
            
        # Combine and ensure valid format
        for t in new_traits:
            if t in TRAIT_LIST: current_traits.add(t)
            
        mon["traits"] = sorted(list(current_traits))
        
        if i % 10 == 0: save_db(db)  # Save more frequently (every 10) to prevent data loss

    save_db(db)

def verify_traits_ai(mon, model="llama3"):
    """Forces the AI to audit the lore and flag hallucinated traits."""
    
    # We only want the AI to audit lore-based traits. 
    # It shouldn't delete visual traits just because they aren't in the text.
    safe_visual_keywords = ["Color:", "Bipedal", "Quadruped", "Flying", "Armored", "Humanoid", "Melee", "Ranged", "Brawler"]
    traits_to_audit = [t for t in mon.get("traits", []) if not any(safe in t for safe in safe_visual_keywords)]
    
    if not traits_to_audit or not mon.get("raw_text"):
        return [] # Nothing to audit

    prompt = f"""
    You are a strict Logic Auditor. Your job is reading comprehension.
    Read this profile for {mon['name']}:
    "{mon['raw_text'][:1500]}"
    
    The AI previously assigned these traits based on the text: {traits_to_audit}
    
    RULE: A trait is ONLY valid if there is explicit evidence in the text.
    TASK: Identify any traits in that list that are completely hallucinated or contradict the text.
    
    Return ONLY a JSON array of the traits that should be REMOVED. 
    If all traits are correct, return an empty array: []
    """
    
    # We can reuse your call_ollama function!
    flagged_for_removal = call_ollama(model, prompt)
    return flagged_for_removal

def verification_menu(db):
    print("\n--- THE AUDITOR ENGINE ---")
    print("This will scan the database for hallucinated traits and logical errors.")
    
    for i, mon in enumerate(db):
        current_traits = set(mon.get("traits", []))
        
        # 1. Hard-Coded Logic Checks (Fast & Free)
        conflicts = []
        if "Bipedal" in current_traits and "Quadruped" in current_traits:
            conflicts.append("Bipedal + Quadruped")
        
        # 2. AI Reading Comprehension Check (Heavy)
        print(f"[{i+1}/{len(db)}] Auditing {mon['name']}...")
        flagged_traits = verify_traits_ai(mon, "llama3")
        
        # If conflicts or flagged traits exist, pause and ask the user
        if conflicts or flagged_traits:
            print(f"\n⚠️ WARNING FOR: {mon['name']}")
            print(f"Current Traits: {sorted(list(current_traits))}")
            if conflicts:
                print(f"  -> Logical Conflicts Found: {conflicts}")
            if flagged_traits:
                print(f"  -> AI Auditor suggests removing: {flagged_traits}")
                
            action = input("Press [ENTER] to ignore, or type 'fix' to launch manual editor: ").strip().lower()
            
            if action == 'fix':
                print("Type the exact names of the traits you want to REMOVE, separated by commas.")
                to_remove = input("Remove: ").split(',')
                for t in to_remove:
                    t = t.strip()
                    if t in current_traits:
                        current_traits.remove(t)
                        print(f"[-] Removed {t}")
                mon["traits"] = sorted(list(current_traits))
                save_db(db)

def main_menu():
    while True:
        db = load_db()
        print("\n" + "="*40)
        print(" 🖥️ DIGIMON DATABASE MANAGER v2.0")
        print("="*40)
        print(f"Current Size: {len(db)} Digimon in local JSON")
        print("1. Apply AI Traits to Database (Offline Mode)")
        print("2. Add Missing Digimon (Delta Update)")
        print("3. Nuke Database (Full Web Scrape)")
        print("4. Verify & Audit Data (Sanity Check)") # <-- NEW
        print("5. Exit")
        
        choice = input("\nSelect an action (1-5): ").strip()
        
        if choice == '1':
            if len(db) == 0: print("Database is empty! Run Option 2 first.")
            else: trait_assignment_menu(db)
        elif choice == '2':
            db = run_scraper(db, force_rebuild=False)
            print("\nWould you like to run the AI on the new additions?")
            if input("(y/n): ").lower() == 'y': trait_assignment_menu(db)
        elif choice == '3':
            confirm = input("⚠️ WARNING: This will delete everything! Are you sure? (y/n): ")
            if confirm.lower() == 'y':
                run_scraper([], force_rebuild=True)
        elif choice == '4':
            verification_menu(db) # <-- NEW
        elif choice == '5':
            print("Exiting...")
            break

if __name__ == "__main__":
    main_menu()