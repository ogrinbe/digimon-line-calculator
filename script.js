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
// 5. Advanced Pathfinding (Multi-BFS & KarnEX Engine)

function findRoute(useKarnEX = false) {
    let start = document.getElementById('start-mon').value;
    let end = document.getElementById('end-mon').value;
    let allowDedigivolve = document.getElementById('allow-dedigivolve').checked;

    if (!start || !end) return alert("Please select both a Start and Target Digimon.");
    if (start === end) return alert("Start and Target are the same Digimon.");

    document.getElementById('route-readout').innerHTML = "Calculating...";

    if (useKarnEX) {
        runKarnEXSearch(start, end, allowDedigivolve);
    } else {
        runCanonicalBFS(start, end, allowDedigivolve);
    }
}

function runCanonicalBFS(start, end, allowDedigivolve) {
    let queue = [{ current: start, pathNodes: [start], pathEdges: [] }];
    // Track visited nodes by the depth we found them to allow converging parallel paths
    let visitedLevels = new Map();
    visitedLevels.set(start, 0);

    let foundRoutes = [];
    let shortestPathLength = Infinity;

    while (queue.length > 0) {
        let { current, pathNodes, pathEdges } = queue.shift();

        // If this path is already longer than our confirmed shortest path, skip it
        if (pathNodes.length > shortestPathLength) continue;

        if (current === end) {
            foundRoutes.push({ nodes: pathNodes, edges: pathEdges });
            shortestPathLength = pathNodes.length; // Lock in the shortest depth
            continue; // Keep searching for other paths of this exact length
        }

        let currentMon = db[current];
        let currentLevelNum = levelMap[currentMon.level] || 8;
        let nextSteps = [];

        // Forward Evolution Logic (Must be higher level unless de-digivolve is allowed)
        currentMon.evolves_to.forEach(next => {
            if (!db[next]) return;
            let nextLevelNum = levelMap[db[next].level] || 8;
            if (allowDedigivolve || nextLevelNum > currentLevelNum) {
                nextSteps.push({ node: next, edgeId: `${current}->${next}` });
            }
        });

        // Backward Evolution Logic (De-digivolving)
        if (allowDedigivolve) {
            currentMon.evolves_from.forEach(prev => {
                if (!db[prev]) return;
                nextSteps.push({ node: prev, edgeId: `${prev}->${current}` });
            });
        }

        for (let step of nextSteps) {
            let nextNode = step.node;
            let nextDepth = pathNodes.length;

            // Visit if unvisited OR if we are reaching it at the exact same depth (parallel path)
            if (!visitedLevels.has(nextNode) || visitedLevels.get(nextNode) >= nextDepth) {
                visitedLevels.set(nextNode, nextDepth);
                queue.push({
                    current: nextNode,
                    pathNodes: [...pathNodes, nextNode],
                    pathEdges: [...pathEdges, step.edgeId]
                });
            }
        }
    }

    displayRoutes(start, end, foundRoutes, "Canonical Path");
}

// KarnEX Heuristic Engine (Dijkstra's Algorithm)
function calculateKarnEXCost(monA, monB) {
    let cost = 100; // Base cost of any jump. Lower is better.

    // 1. Strict Canonical Overlaps
    if (monA.attribute && monA.attribute === monB.attribute) cost -= 20;
    if (monA.type && monA.type === monB.type) cost -= 20;

    // 2. Name prefix overlap (e.g., GeoGreymon -> MetalGreymon)
    let baseNameA = monA.name.replace(/mon$/i, '');
    let baseNameB = monB.name.replace(/mon$/i, '');
    if (baseNameA.length > 3 && monB.name.includes(baseNameA)) cost -= 35;
    if (baseNameB.length > 3 && monA.name.includes(baseNameB)) cost -= 35;

    // 3. Family/Field overlap
    let sharedFields = monA.fields.filter(f => monB.fields.includes(f));
    cost -= (sharedFields.length * 10);

    // 4. Visual & Lore Trait Overlap (The AI Component)
    if (monA.traits && monB.traits) {
        let sharedTraits = monA.traits.filter(t => monB.traits.includes(t));
        let matchCount = sharedTraits.length;

        // Exponential rewarding:
        // 1 shared trait = -5 cost (Slight coincidence, minor bonus)
        // 2 shared traits = -20 cost (Solid thematic connection)
        // 3 shared traits = -45 cost (Very strong KarnEX visual line!)
        // 4+ shared traits = -80 cost (Near guaranteed custom evolution)

        if (matchCount === 1) cost -= 5;
        else if (matchCount === 2) cost -= 20;
        else if (matchCount >= 3) cost -= (matchCount * 15);
    }

    return Math.max(5, cost); // A perfectly logical path will bottom out at a cost of 5.
}

function runKarnEXSearch(start, end, allowDedigivolve) {
    let pq = [{ current: start, pathNodes: [start], pathEdges: [], totalCost: 0 }];
    let minCostToNode = new Map();
    minCostToNode.set(start, 0);

    let bestRoute = null;
    let iterations = 0;

    while (pq.length > 0 && iterations < 3000) {
        // Priority Queue: Always process the lowest cost path next
        pq.sort((a, b) => a.totalCost - b.totalCost);
        let { current, pathNodes, pathEdges, totalCost } = pq.shift();
        iterations++;

        if (current === end) {
            bestRoute = { nodes: pathNodes, edges: pathEdges, cost: totalCost };
            break;
        }

        let currentMon = db[current];
        let currentLevelNum = levelMap[currentMon.level] || 8;

        // KarnEX evaluates ALL Digimon that are exactly 1 Level Higher (or lower if toggled)
        let possibleTargets = dbArray.filter(mon => {
            let targetLevel = levelMap[mon.level] || 8;
            if (allowDedigivolve) {
                return targetLevel === currentLevelNum + 1 || targetLevel === currentLevelNum - 1;
            }
            return targetLevel === currentLevelNum + 1;
        });

        for (let targetMon of possibleTargets) {
            let targetName = targetMon.name;
            let stepCost = calculateKarnEXCost(currentMon, targetMon);
            let newCost = totalCost + stepCost;

            if (!minCostToNode.has(targetName) || newCost < minCostToNode.get(targetName)) {
                minCostToNode.set(targetName, newCost);

                // Virtual Edge ID for custom routing
                let virtualEdgeId = `${current}-karnex->${targetName}`;

                pq.push({
                    current: targetName,
                    pathNodes: [...pathNodes, targetName],
                    pathEdges: [...pathEdges, virtualEdgeId],
                    totalCost: newCost
                });
            }
        }
    }

    if (bestRoute) {
        injectVirtualEdges(bestRoute.edges);
        displayRoutes(start, end, [bestRoute], "KarnEX Logic");
    } else {
        document.getElementById('route-readout').innerHTML = `<span style="color:red">KarnEX could not resolve a logical path.</span>`;
    }
}

// Renders Text and Illuminates Graph
function displayRoutes(start, end, routes, modeTitle) {
    let readout = document.getElementById('route-readout');
    if (routes.length === 0) {
        readout.innerHTML = `<span style="color:red">No ${modeTitle} route found. Try enabling De-digivolution or using KarnEX.</span>`;
        return;
    }

    let html = `<strong>${modeTitle}:</strong> Found ${routes.length} path(s).<br>`;

    // Display up to 6 parallel text paths
    let displayCount = Math.min(routes.length, 6);
    for (let i = 0; i < displayCount; i++) {
        html += `<div style="margin-top:5px; background:#222; padding:5px; border:1px solid #444;">
                    ${routes[i].nodes.join(" ➔ ")}
                 </div>`;
    }
    if (routes.length > 6) html += `<div style="margin-top:5px;">...and ${routes.length - 6} parallel lines highlighted on canvas.</div>`;

    readout.innerHTML = html;

    // Consolidate all unique edges to illuminate on the canvas
    let allEdgesToHighlight = [...new Set(routes.flatMap(r => r.edges))];
    applyHighlight(start, allEdgesToHighlight);
}

// Injects custom dashed lines for the AI Engine
function injectVirtualEdges(customEdges) {
    let existingEdges = edgesDataset.getIds();
    let newEdges = [];

    customEdges.forEach(edgeId => {
        if (!existingEdges.includes(edgeId)) {
            let [from, to] = edgeId.split("-karnex->");
            newEdges.push({
                id: edgeId,
                from: from,
                to: to,
                arrows: 'to',
                color: { color: '#a142f5', opacity: 1 }, // Purple/Pink for Smart Routes
                width: 3,
                dashes: [10, 10] // Makes the line dashed to indicate it's not canonical
            });
        }
    });
    if (newEdges.length > 0) edgesDataset.add(newEdges);
}