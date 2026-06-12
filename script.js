// Map levels to numeric values for hierarchical columns AND math sorting
const levelMap = {
    "Baby I": 1, "Baby II": 2, "Child": 3, "Adult": 4,
    "Perfect": 5, "Ultimate": 6, "Super Ultimate": 7,
    "Armor": 4, // TCG default mapping
    "Hybrid": 4,
    "No Level": 0
};

// Map levels to specific border colors
function getLevelColor(level) {
    const colors = {
        "Baby I": "#ffffff",      // White
        "Baby II": "#cccccc",     // Light Gray
        "Child": "#4287f5",       // Blue (Rookie)
        "Adult": "#42f566",       // Green (Champion)
        "Perfect": "#a142f5",     // Purple (Ultimate)
        "Ultimate": "#f5d142",    // Gold (Mega)
        "Super Ultimate": "#ff0000", // Red (Ultra)
        "Armor": "#ff8800",       // Orange
        "Hybrid": "#00e5ff"       // Cyan
    };
    return colors[level] || "#888888";
}

let db = {};
let network = null;

// 1. Fetch the JSON file
fetch('digimon_db.json')
    .then(response => response.json())
    .then(data => {
        data.forEach(mon => { db[mon.name] = mon; });

        // Run the math!
        let totalLines = calculateTotalPossibleLines(data);
        document.getElementById('total-stats').innerText =
            `Database Loaded: ${data.length} Digimon | Total Canonical Lines: ${totalLines.toLocaleString()}`;

        // Populate the dropdowns for the Route Finder UI
        populateDropdowns(data);

        // Draw the massive, structured web
        drawStructuredGraph(data);
    });

// 2. The Math (Loop-Safe)
function calculateTotalPossibleLines(digimonArray) {
    let memo = {};

    function countPaths(digimonName) {
        if (!db[digimonName]) return 0;
        if (memo[digimonName] !== undefined) return memo[digimonName];

        let currentMon = db[digimonName];
        let currentLevelNum = levelMap[currentMon.level] || 0;

        // INFINITE LOOP PREVENTION: Only count evolutions that go UP in level
        let validEvolutions = currentMon.evolves_to.filter(targetName => {
            let targetMon = db[targetName];
            return targetMon && (levelMap[targetMon.level] || 0) > currentLevelNum;
        });

        if (validEvolutions.length === 0) return 1;

        let total = 0;
        for (let nextMon of validEvolutions) total += countPaths(nextMon);

        memo[digimonName] = total;
        return total;
    }

    let totalGlobalLines = 0;
    digimonArray.forEach(mon => {
        let levelNum = levelMap[mon.level] || 0;
        // Start counting only from the absolute bottom of the tree
        if (levelNum === 1 || mon.evolves_from.length === 0) {
            totalGlobalLines += countPaths(mon.name);
        }
    });
    return totalGlobalLines;
}

// 3. Render the Massive Grid (No Physics, Strict Hierarchy)
function drawStructuredGraph(data) {
    let nodesArray = [];
    let edgesArray = [];

    data.forEach(mon => {
        // Build Node with Level Property and Colors
        nodesArray.push({
            id: mon.name,
            label: mon.english_name || mon.name,
            shape: 'circularImage',
            image: mon.image_url || 'https://via.placeholder.com/50',
            size: 20,
            level: levelMap[mon.level] || 0, // CRITICAL: This dictates the column it sits in
            borderWidth: 4,
            color: {
                border: getLevelColor(mon.level),
                background: '#222'
            },
            font: { color: '#ffffff', size: 10 }
        });

        // Build Edges
        mon.evolves_to.forEach(nextMon => {
            if (db[nextMon]) {
                edgesArray.push({
                    from: mon.name,
                    to: nextMon,
                    arrows: 'to',
                    color: { color: '#444444', opacity: 0.5 }
                });
            }
        });
    });

    const container = document.getElementById('mynetwork');
    const graphData = { nodes: nodesArray, edges: edgesArray };

    const options = {
        physics: false, // Turned off completely to prevent the "Black Hole" effect
        layout: {
            hierarchical: {
                enabled: true,
                direction: 'LR', // Left to Right
                sortMethod: 'custom', // Uses the 'level' property we assigned to nodes
                levelSeparation: 300, // Distance between columns (e.g., Rookie column to Champion column)
                nodeSpacing: 40       // Distance between Digimon in the same column
            }
        },
        edges: { smooth: { type: 'cubicBezier', forceDirection: 'horizontal' } }
    };

    if (network !== null) network.destroy();
    network = new vis.Network(container, graphData, options);
}

// Helper: Fill the UI Dropdowns
function populateDropdowns(data) {
    const startSelect = document.getElementById('start-mon');
    const endSelect = document.getElementById('end-mon');

    // Sort alphabetically for the dropdown
    let sortedNames = data.map(m => m.name).sort();

    sortedNames.forEach(name => {
        let option1 = document.createElement('option');
        option1.value = option1.innerText = name;
        startSelect.appendChild(option1);

        let option2 = document.createElement('option');
        option2.value = option2.innerText = name;
        endSelect.appendChild(option2);
    });
}