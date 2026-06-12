// 1. Level Map Updated: "No Level" is now 8, placing it after Super Ultimate (7)
const levelMap = {
    "Baby I": 1, "Baby II": 2, "Child": 3, "Adult": 4,
    "Perfect": 5, "Ultimate": 6, "Super Ultimate": 7,
    "Armor": 4, "Hybrid": 4, "No Level": 8
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
let network = null;
let nodesDataset = null; // New: Allows live updating of node colors
let edgesDataset = null;

fetch('digimon_db.json')
    .then(response => response.json())
    .then(data => {
        data.forEach(mon => { db[mon.name] = mon; });

        let totalLines = calculateTotalPossibleLines(data);
        document.getElementById('total-stats').innerText =
            `Database Loaded: ${data.length} Digimon | Total Canonical Lines: ${totalLines.toLocaleString()}`;

        drawStructuredGraph(data);
    });

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

function drawStructuredGraph(data) {
    let rawNodes = [];
    let rawEdges = [];

    data.forEach(mon => {
        rawNodes.push({
            id: mon.name,
            label: mon.english_name || mon.name,
            shape: 'circularImage',
            image: mon.image_url || 'https://via.placeholder.com/50',
            size: 40, // Increased image size!
            level: levelMap[mon.level] || 8, // Sorts No Level to the end
            borderWidth: 4,
            color: { border: getLevelColor(mon.level), background: '#222', opacity: 1 },
            font: { color: '#ffffff', size: 14 } // Bigger font
        });

        mon.evolves_to.forEach(nextMon => {
            if (db[nextMon]) {
                rawEdges.push({
                    from: mon.name,
                    to: nextMon,
                    arrows: 'to',
                    color: { color: '#555', opacity: 0.6 }
                });
            }
        });
    });

    // Load into Vis DataSets for dynamic clicking
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
                nodeSpacing: 70 // Decreased spacing to bring Digimon closer together
            }
        },
        interaction: {
            hideEdgesOnDrag: true, // IMMENSE PERFORMANCE BOOST WHEN ZOOMING/PANNING
            hover: true
        },
        edges: {
            smooth: false, // Straight lines process 10x faster than curved lines
            width: 1
        }
    };

    if (network !== null) network.destroy();
    network = new vis.Network(container, graphData, options);

    // QoL: Click Event for Highlighting
    network.on("click", function (params) {
        if (params.nodes.length > 0) {
            let selectedNodeId = params.nodes[0];
            let connectedNodes = network.getConnectedNodes(selectedNodeId);
            let allFocusNodes = [...connectedNodes, selectedNodeId];

            let updateArray = nodesDataset.get().map(node => {
                if (allFocusNodes.includes(node.id)) {
                    node.color.opacity = 1;
                    node.font = { color: '#ffffff', size: 16, bold: true };
                } else {
                    node.color.opacity = 0.1; // Fade out the rest of the web
                    node.font = { color: '#333333', size: 14 };
                }
                return node;
            });
            nodesDataset.update(updateArray);
        } else {
            // Clicked empty space: Reset everything
            let resetArray = nodesDataset.get().map(node => {
                node.color.opacity = 1;
                node.font = { color: '#ffffff', size: 14, bold: false };
                return node;
            });
            nodesDataset.update(resetArray);
        }
    });
}