const levelMap = {
    "Baby I": 1, "Baby II": 2, "Child": 3, "Adult": 4,
    "Perfect": 5, "Ultimate": 6, "Super Ultimate": 7,
    "Armor": 4, "Hybrid": 4, "No Level": 0
};

let db = {};
let network = null; // Store the graph instance

// 1. Fetch the JSON file
fetch('digimon_db.json')
    .then(response => response.json())
    .then(data => {
        data.forEach(mon => { db[mon.name] = mon; });

        // Calculate the math (this is lightning fast)
        let totalLines = calculateTotalPossibleLines(data);
        document.getElementById('total-stats').innerText =
            `Total Digimon: ${data.length} | Total Possible Lines: ${totalLines.toLocaleString()}`;

        // Draw an empty graph to start
        initGraph([], []);
    });

// 2. The Math (Unchanged - it was already fast)
function calculateTotalPossibleLines(digimonArray) {
    let memo = {};
    function countPaths(digimonName) {
        if (!db[digimonName]) return 0;
        if (memo[digimonName] !== undefined) return memo[digimonName];

        let currentMon = db[digimonName];
        let currentLevelNum = levelMap[currentMon.level] || 0;

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
        if (levelNum === 1 || mon.evolves_from.length === 0) {
            totalGlobalLines += countPaths(mon.name);
        }
    });
    return totalGlobalLines;
}

// 3. Search and Focus Logic
function searchDigimon() {
    let query = document.getElementById('searchBox').value.trim();

    // Capitalize first letter to match database (e.g. "agumon" -> "Agumon")
    if (query.length > 0) {
        query = query.charAt(0).toUpperCase() + query.slice(1);
    }

    if (!db[query]) {
        alert("Digimon not found! Make sure you spelled it right.");
        return;
    }

    let nodesToDraw = new Map();
    let edgesToDraw = [];

    // Helper function to create a node safely
    function addNode(monName) {
        if (!nodesToDraw.has(monName) && db[monName]) {
            let mon = db[monName];
            nodesToDraw.set(monName, {
                id: mon.name,
                label: mon.english_name || mon.name,
                shape: 'circularImage',
                image: mon.image_url || 'https://via.placeholder.com/50',
                size: 30,
                font: { color: '#ffffff' },
                level: levelMap[mon.level] || 0 // Used for sorting the tree
            });
        }
    }

    // Add the searched Digimon
    addNode(query);

    // Add what it evolves FROM
    db[query].evolves_from.forEach(prevMon => {
        if (db[prevMon]) {
            addNode(prevMon);
            edgesToDraw.push({ from: prevMon, to: query, arrows: 'to', color: '#ffcc00' });
        }
    });

    // Add what it evolves TO
    db[query].evolves_to.forEach(nextMon => {
        if (db[nextMon]) {
            addNode(nextMon);
            edgesToDraw.push({ from: query, to: nextMon, arrows: 'to', color: '#ffcc00' });
        }
    });

    // Update the graph
    initGraph(Array.from(nodesToDraw.values()), edgesToDraw);
}

// 4. The FAST Graph Renderer
function initGraph(nodesArray, edgesArray) {
    const container = document.getElementById('mynetwork');
    const graphData = { nodes: nodesArray, edges: edgesArray };

    const options = {
        // TURN OFF PHYSICS: This stops the CPU from melting
        physics: { enabled: false },

        // HIERARCHICAL LAYOUT: Forces it into a neat Left-to-Right tree
        layout: {
            hierarchical: {
                direction: "LR", // Left to Right
                sortMethod: "directed",
                nodeSpacing: 150,
                levelSeparation: 250
            }
        },
        nodes: { borderWidth: 2, color: { border: '#444', background: '#ffffff' } },
        edges: { smooth: { type: 'cubicBezier', forceDirection: 'horizontal' } }
    };

    if (network !== null) {
        network.destroy(); // Clear old graph
    }
    network = new vis.Network(container, graphData, options);
}