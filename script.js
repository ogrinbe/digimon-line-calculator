// Dynamic Level Map
let levelMap = {
    "Baby I": 1, "Baby II": 2, "Child": 3, "Adult": 4,
    "Perfect": 5, "Ultimate": 6, "Super Ultimate": 7,
    "Armor": 4, "Hybrid": 4, "No Level": 8 // Pushed past Mega
};

function getLevelColor(level) {
    const colors = {
        "Baby I": "#ffffff", "Baby II": "#cccccc", "Child": "#4287f5",
        "Adult": "#42f566", "Perfect": "#a142f5", "Ultimate": "#f5d142",
        "Super Ultimate": "#ff0000", "Armor": "#ff8800", "Hybrid": "#00e5ff"
    };
    return colors[level] || "#888888";
}

let db = {};
let dbArray = [];
let network = null;
let nodesDataset = null;
let edgesDataset = null;

// 1. Initialization
fetch('digimon_db.json')
    .then(response => response.json())
    .then(data => {
        dbArray = data;
        data.forEach(mon => { db[mon.name] = mon; });
        populateDropdowns(data);
        updateTCGRules(); // Bootstraps the math and draws the graph
    });

// 2. Dynamic TCG Rules & Math Recalculation
function updateTCGRules() {
    let armorIsChamp = document.getElementById('armor-champ').checked;
    let hybridIsChamp = document.getElementById('hybrid-champ').checked;
    let hybridIsUlt = document.getElementById('hybrid-ult').checked;

    levelMap["Armor"] = armorIsChamp ? 4 : 8;

    // Simplistic handling for general "Hybrid" tag based on checkboxes
    if (hybridIsUlt) levelMap["Hybrid"] = 5;
    else if (hybridIsChamp) levelMap["Hybrid"] = 4;
    else levelMap["Hybrid"] = 8;

    let totalLines = calculateTotalPossibleLines(dbArray);
    document.getElementById('total-stats').innerText =
        `Database: ${dbArray.length} Digimon | Possible Lines: ${totalLines.toLocaleString()}`;

    drawStructuredGraph(dbArray);
}

function calculateTotalPossibleLines(digimonArray) {
    let memo = {};

    function countPaths(digimonName) {
        if (!db[digimonName]) return 0;
        if (memo[digimonName] !== undefined) return memo[digimonName];

        let currentMon = db[digimonName];
        let currentLevelNum = levelMap[currentMon.level] || 8;

        let validEvolutions = currentMon.evolves_to.filter(targetName => {
            let targetMon = db[targetName];
            return targetMon && (levelMap[targetMon.level] || 8) > currentLevelNum;
        });

        if (validEvolutions.length === 0) return 1;

        let total = 0;
        for (let nextMon of validEvolutions) total += countPaths(nextMon);

        memo[digimonName] = total;
        return total;
    }

    let totalGlobalLines = 0;
    digimonArray.forEach(mon => {
        let levelNum = levelMap[mon.level] || 8;
        if (levelNum === 1 || mon.evolves_from.length === 0) {
            totalGlobalLines += countPaths(mon.name);
        }
    });
    return totalGlobalLines;
}

// 3. Render Graph (Offshoots Fixed)
function drawStructuredGraph(data) {
    let rawNodes = [];
    let rawEdges = [];

    data.forEach(mon => {
        rawNodes.push({
            id: mon.name,
            label: mon.english_name || mon.name,
            shape: 'circularImage',
            image: mon.image_url || 'https://via.placeholder.com/50',
            size: 25,
            level: levelMap[mon.level] || 8,
            borderWidth: 3,
            color: { border: getLevelColor(mon.level), background: '#222', opacity: 1 },
            font: { color: '#ffffff', size: 12 }
        });

        mon.evolves_to.forEach(nextMon => {
            if (db[nextMon]) {
                rawEdges.push({
                    id: mon.name + "->" + nextMon, // Explicit ID for highlighting
                    from: mon.name,
                    to: nextMon,
                    arrows: 'to',
                    color: { color: '#555555', opacity: 0.6 },
                    width: 1
                });
            }
        });
    });

    nodesDataset = new vis.DataSet(rawNodes);
    edgesDataset = new vis.DataSet(rawEdges);

    const container = document.getElementById('mynetwork');
    const graphData = { nodes: nodesDataset, edges: edgesDataset };

    const options = {
        physics: false,
        layout: {
            hierarchical: {
                enabled: true,
                direction: 'LR',
                sortMethod: 'custom',
                levelSeparation: 250,
                nodeSpacing: 40,
                treeSpacing: 40,
                blockShifting: false // CRITICAL: Stops Digimon from flying offshoot
            }
        },
        interaction: { hideEdgesOnDrag: true },
        edges: { smooth: false } // Straight lines for maximum performance
    };

    if (network !== null) network.destroy();
    network = new vis.Network(container, graphData, options);

    network.on("click", function (params) {
        if (params.nodes.length > 0) applyHighlight(params.nodes[0]);
        else resetGraph();
    });
}

// 4. Search and Highlighting Logic
function searchAndFocus() {
    let query = document.getElementById('searchBox').value.trim();
    if (query.length > 0) query = query.charAt(0).toUpperCase() + query.slice(1);

    if (!db[query]) {
        alert("Digimon not found in database.");
        return;
    }
    applyHighlight(query);
}

function applyHighlight(centerNodeId, customPathEdges = null) {
    network.focus(centerNodeId, { scale: 1.2, animation: { duration: 800, easingFunction: "easeInOutQuad" } });

    let connectedNodes = network.getConnectedNodes(centerNodeId);
    let allFocusNodes = [centerNodeId, ...connectedNodes];

    // If we are passing a specific BFS route, override standard highlights
    let edgesToHighlight = customPathEdges || network.getConnectedEdges(centerNodeId);

    // Fade non-connected nodes
    let updateNodes = nodesDataset.get().map(node => {
        let isFocused = customPathEdges ? true : allFocusNodes.includes(node.id); // If BFS, keep all nodes visible
        if (!customPathEdges) {
            node.color.opacity = isFocused ? 1 : 0.1;
            node.font.color = isFocused ? '#ffffff' : '#222222';
        }
        return node;
    });
    nodesDataset.update(updateNodes);

    // Light up arrows neon yellow
    let updateEdges = edgesDataset.get().map(edge => {
        if (edgesToHighlight.includes(edge.id)) {
            edge.color = { color: '#ffff00', opacity: 1 };
            edge.width = 4; // Make arrow thick
        } else {
            edge.color = { color: '#333333', opacity: 0.1 };
            edge.width = 1;
        }
        return edge;
    });
    edgesDataset.update(updateEdges);
}

function resetGraph() {
    let updateNodes = nodesDataset.get().map(node => {
        node.color.opacity = 1;
        node.font.color = '#ffffff';
        return node;
    });
    let updateEdges = edgesDataset.get().map(edge => {
        edge.color = { color: '#555555', opacity: 0.6 };
        edge.width = 1;
        return edge;
    });
    nodesDataset.update(updateNodes);
    edgesDataset.update(updateEdges);
    network.fit({ animation: true }); // Zooms out to see everything
}

// 5. Breadth-First Search (Route Finder)
function findRoute() {
    let start = document.getElementById('start-mon').value;
    let end = document.getElementById('end-mon').value;
    let allowDedigivolve = document.getElementById('allow-dedigivolve').checked;

    if (!start || !end) return alert("Please select both a Start and Target Digimon.");
    if (start === end) return alert("Start and Target are the same Digimon.");

    let queue = [{ current: start, pathNodes: [start], pathEdges: [] }];
    let visited = new Set([start]);
    let foundRoute = null;

    while (queue.length > 0) {
        let { current, pathNodes, pathEdges } = queue.shift();

        if (current === end) {
            foundRoute = { nodes: pathNodes, edges: pathEdges };
            break;
        }

        let nextSteps = [...db[current].evolves_to];
        if (allowDedigivolve) nextSteps = nextSteps.concat(db[current].evolves_from);

        for (let next of nextSteps) {
            if (db[next] && !visited.has(next)) {
                visited.add(next);
                // Determine if we are moving forward or backward for the edge ID
                let isForward = db[current].evolves_to.includes(next);
                let edgeId = isForward ? (current + "->" + next) : (next + "->" + current);

                queue.push({
                    current: next,
                    pathNodes: [...pathNodes, next],
                    pathEdges: [...pathEdges, edgeId]
                });
            }
        }
    }

    if (foundRoute) {
        // Highlight the specific path through the graph
        applyHighlight(start, foundRoute.edges);
    } else {
        alert("No evolutionary route exists between these Digimon.");
    }
}

function populateDropdowns(data) {
    const startSelect = document.getElementById('start-mon');
    const endSelect = document.getElementById('end-mon');
    let sortedNames = data.map(m => m.name).sort();

    sortedNames.forEach(name => {
        startSelect.add(new Option(name, name));
        endSelect.add(new Option(name, name));
    });
}