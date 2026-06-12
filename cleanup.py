import json

def clean_database(filepath="digimon_db.json"):
    with open(filepath, "r", encoding="utf-8") as f:
        db = json.load(f)
        
    cleaned_count = 0
        
    for digimon in db:
        traits = digimon.get("traits", [])
        original_length = len(traits)
        
        # Hard rule: Spirit tags belong exclusively to Hybrid level Digimon
        if digimon.get("level") != "Hybrid":
            traits = [t for t in traits if t not in ["Human Spirit", "Beast Spirit"]]
            
        # Optional: Example of how to strip "Machine/Metal" from organic Digimon
        # type_str = digimon.get("type", "")
        # if "Machine/Metal" in traits and "Cyborg" not in type_str and "Machine" not in type_str:
        #     traits.remove("Machine/Metal")
            
        if len(traits) < original_length:
            cleaned_count += 1
            
        digimon["traits"] = traits

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=4, ensure_ascii=False)
        
    print(f"Cleanup complete. Corrected traits for {cleaned_count} Digimon.")

if __name__ == "__main__":
    clean_database()