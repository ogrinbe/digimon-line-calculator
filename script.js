const levelMap = {
    "Baby I": 1, "Baby II": 2, "Child": 3, "Adult": 4,
    "Perfect": 5, "Ultimate": 6, "Super Ultimate": 7,
    "Armor": 4, "Hybrid": 4, "No Level": 0
};

let db = {};
let network = null;

// 1. Fetch the JSON file
fetch('digimon_db.json')
    .then(response => response.json())
    .then(data => {
        data.forEach(mon => { db[mon.name] = mon; });

        let totalLines = calculateTotalPossibleLines(data);
        document.getElementById('total-stats').innerText =
            `Total Digimon: ${data.length} | Total Possible Lines: ${totalLines.toLocaleString()}`;

        // Render the massive graph immediately on load
        drawFullGraph(data);
    });

// 2. The Math
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

// 3. Render the Massive Grid (Performantly)
function drawFullGraph(data) {
    document.getElementById('total-stats').innerText = "Calculating graph layout... Please wait.";

    let nodesArray = [];
    let edgesArray = [];

    // Build all nodes
    data.forEach(mon => {
        nodesArray.push({
            id: mon.name,
            label: mon.english_name || mon.name,
            shape: 'circularImage',
            image: mon.image_url || 'https://via.placeholder.com/50',
            size: 25,
            font: { color: '#ffffff', size: 10 }
        });

        // Build all edges
        mon.evolves_to.forEach(nextMon => {
            if (db[nextMon]) {
                edgesArray.push({
                    from: mon.name,
                    to: nextMon,
                    arrows: 'to',
                    color: '#555555'
                });
            }
        });
    });

    initGraph(nodesArray, edgesArray, true);
}

// 4. Search function logic
function searchDigimon() {
    let query = document.getElementById('searchBox').value.trim();

    if (query.length > 0) {
        query = query.charAt(0).toUpperCase() + query.slice(1);
    }

    if (!db[query]) {
        alert("Digimon not found! Make sure you spelled it right.");
        return;
    }

    // Instead of redrawing the graph, we can focus the camera on the searched Digimon
    if (network) {
        network.focus(query, {
            scale: 1.5,
            animation: { duration: 1000, easingFunction: "easeInOutQuad" }
        });
        network.selectNodes([query]);
    }
}

// 5. The Graph Renderer with Pre-Stabilization
function initGraph(nodesArray, edgesArray, isFullGraph = false) {
    const container = document.getElementById('mynetwork');
    const graphData = { nodes: nodesArray, edges: edgesArray };

    const options = {
        layout: {
            improvedLayout: false // CRITICAL: Speeds up calculation for networks > 100 nodes
        },
        physics: {
            enabled: true,
            stabilization: {
                enabled: true,
                iterations: 150, // Calculates 150 layout steps invisibly before showing anything
                updateInterval: 50
            },
            barnesHut: {
                gravitationalConstant: -800, // Pushes nodes apart
                centralGravity: 0.3,
                springLength: 100
            }
        },
        nodes: { borderWidth: 1, color: { border: '#444', background: '#ffffff' } },
        edges: { smooth: { type: 'continuous' } } // Continuous is much faster to render than cubicBezier
    };

    if (network !== null) {
        network.destroy();
    }

    network = new vis.Network(container, graphData, options);

    // Turn off physics once the initial layout is complete so the CPU rests
    network.once("stabilizationIterationsDone", function () {
        network.setOptions({ physics: { enabled: false } });
        document.getElementById('total-stats').innerText =
            `Total Digimon: ${nodesArray.length} | Graph Loaded!`;
    });
}