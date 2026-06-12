// Feature 3: Level Normalization
// This maps text levels to numbers so we can prevent infinite loops.
// You can easily tie these to checkboxes later to dynamically change the numbers!
const levelMap = {
    "Baby I": 1,
    "Baby II": 2,
    "Child": 3,
    "Adult": 4,
    "Perfect": 5,
    "Ultimate": 6,
    "Super Ultimate": 7,
    "Armor": 4,  // Treated as Adult/Champion
    "Hybrid": 4, // Base Spirit treated as Adult
    "No Level": 0 // Fallback
};

let db = {}; // Will hold our Digimon data as { "Agumon": {data} }

// 1. Fetch the JSON file
fetch('digimon_db.json')
    .then(response => response.json())
    .then(data => {
        // Convert array to a fast lookup dictionary
        data.forEach(mon => {
            db[mon.name] = mon;
        });

        initApp(data);
    })
    .catch(error => console.error("Error loading JSON:", error));

function initApp(digimonArray) {
    let totalLines = calculateTotalPossibleLines(digimonArray);

    // Update the UI
    document.querySelector('#stats-bar h2').innerText =
        `Total Digimon: ${digimonArray.length} | Total Possible Canonical Lines: ${totalLines.toLocaleString()}`;

    // Render the Giant Web
    renderGiantWeb(digimonArray);
}

// 2. The Math: Counting Lines Without Infinite Loops
function calculateTotalPossibleLines(digimonArray) {
    let memo = {}; // Cache to store calculations and run lightning fast

    function countPaths(digimonName) {
        if (!db[digimonName]) return 0;

        // If we already calculated this Digimon, return the saved answer
        if (memo[digimonName] !== undefined) return memo[digimonName];

        let currentMon = db[digimonName];
        let currentLevelNum = levelMap[currentMon.level] || 0;

        // Filter evolutions: ONLY allow evolving UP to a higher level tier to break cycles
        let validEvolutions = currentMon.evolves_to.filter(targetName => {
            let targetMon = db[targetName];
            if (!targetMon) return false;
            let targetLevelNum = levelMap[targetMon.level] || 0;
            return targetLevelNum > currentLevelNum;
        });

        // If it can't evolve any further, it is the end of 1 specific line
        if (validEvolutions.length === 0) {
            return 1;
        }

        let total = 0;
        for (let nextMon of validEvolutions) {
            total += countPaths(nextMon);
        }

        memo[digimonName] = total; // Save for later
        return total;
    }

    let totalGlobalLines = 0;

    // We start counting from the absolute bottom (Baby I, or Digimon with no prior forms)
    digimonArray.forEach(mon => {
        let levelNum = levelMap[mon.level] || 0;
        if (levelNum === 1 || mon.evolves_from.length === 0) {
            totalGlobalLines += countPaths(mon.name);
        }
    });

    return totalGlobalLines;
}

// 3. Rendering the Web using Vis-Network
function renderGiantWeb(digimonArray) {
    const nodes = [];
    const edges = [];
    const addedEdges = new Set(); // Prevent drawing duplicate lines

    digimonArray.forEach(mon => {
        // Create the Node with the Image
        nodes.push({
            id: mon.name,
            label: mon.english_name || mon.name, // Use English name if available
            shape: 'circularImage',
            image: mon.image_url || 'https://via.placeholder.com/50', // Fallback if no image
            size: 30,
            font: { color: '#ffffff' }
        });

        // Create the Evolution Edges
        let currentLevelNum = levelMap[mon.level] || 0;

        mon.evolves_to.forEach(targetName => {
            if (db[targetName]) {
                let targetLevelNum = levelMap[db[targetName].level] || 0;

                // Only draw arrows going UP in level to keep the web readable
                if (targetLevelNum > currentLevelNum) {
                    let edgeId = `${mon.name}->${targetName}`;
                    if (!addedEdges.has(edgeId)) {
                        edges.push({
                            from: mon.name,
                            to: targetName,
                            arrows: 'to',
                            color: { color: '#666', opacity: 0.5 }
                        });
                        addedEdges.add(edgeId);
                    }
                }
            }
        });
    });

    const container = document.getElementById('mynetwork');
    const graphData = { nodes: nodes, edges: edges };

    // Vis.js Physics Options
    const options = {
        physics: {
            stabilization: false, // Turn off stabilization to load the massive graph faster
            barnesHut: { gravitationalConstant: -80000, springConstant: 0.001, springLength: 200 }
        },
        nodes: { borderWidth: 2, color: { border: '#ffcc00', background: '#ffffff' } }
    };

    new vis.Network(container, graphData, options);
}