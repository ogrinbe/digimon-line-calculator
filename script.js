// --- Core Data & Rules ---
let levelMap = {
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
let dbArray = [];
let network = null;
let nodesDataset = null;
let edgesDataset = null;
let virtualEdgeIds = [];

// --- Initialization ---
fetch('digimon_db.json')
    .then(response => response.json())
    .then(data => {
        dbArray = data;
        data.forEach(mon => { db[mon.name] = mon; });
        populateFilterDropdowns(data);
        populateWaypoints();
        initLineMaker();
        updateTCGRules();
    });

// --- Dynamic TCG Rules ---
function updateTCGRules() {
    let armorIsChamp = document.getElementById('armor-champ').checked;
    let hybridIsChamp = document.getElementById('hybrid-champ').checked;
    let hybridIsUlt = document.getElementById('hybrid-ult').checked;

    levelMap["Armor"] = armorIsChamp ? 4 : 8;
    if (hybridIsUlt) levelMap["Hybrid"] = 5;
    else if (hybridIsChamp) levelMap["Hybrid"] = 4;
    else levelMap["Hybrid"] = 8;

    let totalLines = calculateTotalPossibleLines(dbArray);
    document.getElementById('total-stats').innerText = `Database: ${dbArray.length} Digimon | Canonical Lines: ${totalLines.toLocaleString()}`;
    drawStructuredGraph(dbArray);
}

function calculateTotalPossibleLines(digimonArray) {
    let memo = {};
    function countPaths(digimonName) {
        if (!db[digimonName]) return 0;
        if (memo[digimonName] !== undefined) return memo[digimonName];
        let currentMon = db[digimonName];
        let currentLevelNum = levelMap[currentMon.level] || 8;
        let validEvolutions = currentMon.evolves_to.filter(t => db[t] && (levelMap[db[t].level] || 8) > currentLevelNum);
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

// --- Render Graph ---
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
            font: { color: '#ffffff', size: 12 },
            hidden: false
        });

        mon.evolves_to.forEach(nextMon => {
            if (db[nextMon]) {
                rawEdges.push({
                    id: mon.name + "->" + nextMon,
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
                enabled: true, direction: 'LR', sortMethod: 'custom',
                levelSeparation: 250, nodeSpacing: 40, treeSpacing: 40, blockShifting: false
            }
        },
        interaction: { hideEdgesOnDrag: true },
        edges: { smooth: false }
    };

    if (network !== null) network.destroy();
    network = new vis.Network(container, graphData, options);

    // Sidebar & Tree Focus Hook
    network.on("click", function (params) {
        if (params.nodes.length > 0) {
            let clickedId = params.nodes[0];
            showSidebarDetails(clickedId);
            applyHighlight(clickedId); 
        } else {
            resetGraph();
            document.getElementById('info-sidebar').style.display = 'none';
        }
    });
}

// --- Tree Traversal & Highlighting ---
function getFamilyTree(startId) {
    let family = new Set();
    family.add(startId);

    // Forward Search (Descendants)
    let queue = [startId];
    let head = 0;
    while(head < queue.length) {
        let curr = queue[head++];
        if(db[curr]) {
            db[curr].evolves_to.forEach(next => {
                if(db[next] && !family.has(next)) { family.add(next); queue.push(next); }
            });
        }
    }

    // Backward Search (Ancestors)
    queue = [startId];
    head = 0;
    while(head < queue.length) {
        let curr = queue[head++];
        if(db[curr]) {
            db[curr].evolves_from.forEach(prev => {
                if(db[prev] && !family.has(prev)) { family.add(prev); queue.push(prev); }
            });
        }
    }
    return Array.from(family);
}

function applyHighlight(centerNodeId, customPathEdges = null) {
    let isFocusMode = document.getElementById('focus-mode-toggle').checked;
    
    // Animate camera to node
    if(!customPathEdges) {
        network.focus(centerNodeId, { scale: 1.2, animation: { duration: 800, easingFunction: "easeInOutQuad" } });
    }

    // Get nodes to illuminate (Either custom route, or the full family tree)
    let focusNodes = customPathEdges ? [] : getFamilyTree(centerNodeId);
    let edgesToHighlight = customPathEdges || network.getConnectedEdges(centerNodeId);

    let updateNodes = nodesDataset.get().map(node => {
        let isFocused = customPathEdges ? true : focusNodes.includes(node.id);
        
        if (!customPathEdges) {
            if (isFocusMode) {
                node.hidden = !isFocused; // Progressive disclosure
            } else {
                node.hidden = false;
                node.color.opacity = isFocused ? 1 : 0.1;
                node.font.color = isFocused ? '#ffffff' : '#222222';
            }
        }
        return node;
    });
    nodesDataset.update(updateNodes);

    let updateEdges = edgesDataset.get().map(edge => {
        if (edgesToHighlight.includes(edge.id)) {
            edge.color = { color: '#ffff00', opacity: 1 };
            edge.width = 4;
        } else {
            edge.color = { color: '#333333', opacity: 0.1 };
            edge.width = 1;
            if(isFocusMode && !customPathEdges) {
                edge.hidden = !(focusNodes.includes(edge.from) && focusNodes.includes(edge.to));
            } else {
                edge.hidden = false;
            }
        }
        return edge;
    });
    edgesDataset.update(updateEdges);
}

function searchAndFocus() {
    let query = document.getElementById('searchBox').value.trim();
    if (query.length > 0) query = query.charAt(0).toUpperCase() + query.slice(1);
    if (!db[query]) return alert("Digimon not found.");
    applyHighlight(query);
    showSidebarDetails(query);
}

function resetGraph() {
    if (virtualEdgeIds.length > 0) {
        edgesDataset.remove(virtualEdgeIds);
        virtualEdgeIds = [];
    }
    let updateNodes = nodesDataset.get().map(n => { n.color.opacity = 1; n.font.color = '#ffffff'; n.hidden = false; return n; });
    let updateEdges = edgesDataset.get().map(e => { e.color = { color: '#555555', opacity: 0.6 }; e.width = 1; e.hidden = false; return e; });
    nodesDataset.update(updateNodes);
    edgesDataset.update(updateEdges);
    network.fit({ animation: true });
}

// --- Info Sidebar ---
function showSidebarDetails(name) {
    let mon = db[name];
    if (!mon) return;
    document.getElementById('info-sidebar').style.display = 'block';
    document.getElementById('side-name').innerText = mon.english_name || mon.name;
    document.getElementById('side-level').innerText = mon.level || 'Unknown';
    document.getElementById('side-attr').innerText = mon.attribute || 'Unknown';
    document.getElementById('side-type').innerText = mon.type || 'Unknown';
    document.getElementById('side-profile').innerText = mon.raw_text || 'No profile documentation found.';

    let traitsContainer = document.getElementById('side-traits');
    traitsContainer.innerHTML = '';
    if (mon.traits && mon.traits.length > 0) {
        mon.traits.forEach(trait => {
            let tag = document.createElement('span');
            tag.className = 'trait-tag';
            tag.innerText = trait;
            traitsContainer.appendChild(tag);
        });
    }
}

// --- UI Logic: Waypoints, Filters, Export ---
function switchView(view) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('controls-network').style.display = view === 'network' ? 'grid' : 'none';
    document.getElementById('network-view').style.display = view === 'network' ? 'flex' : 'none';
    document.getElementById('line-maker-view').style.display = view === 'linemaker' ? 'block' : 'none';
    if(view === 'network') network.fit();
}

function populateWaypoints() {
    let selects = document.querySelectorAll('.route-node');
    let sorted = [...dbArray].sort((a, b) => a.name.localeCompare(b.name));
    let optionsHtml = '<option value="">Select Digimon...</option>' + 
                      sorted.map(m => `<option value="${m.name}">${m.english_name || m.name}</option>`).join('');
    selects.forEach(sel => sel.innerHTML = optionsHtml);
}

function addWaypoint() {
    let container = document.createElement('div');
    container.className = 'waypoint-container';
    container.innerHTML = `<select class="route-node">${document.querySelector('.route-node').innerHTML}</select>
                           <button class="remove-btn" onclick="this.parentElement.remove()">X</button>`;
    document.getElementById('waypoint-list').appendChild(container);
}

function populateFilterDropdowns(data) {
    let levelFilter = document.getElementById('filter-level');
    let attrFilter = document.getElementById('filter-attribute');
    let levels = [...new Set(data.map(m => m.level).filter(Boolean))];
    let attributes = [...new Set(data.map(m => m.attribute).filter(Boolean))];
    levels.forEach(lvl => levelFilter.add(new Option(lvl, lvl)));
    attributes.forEach(attr => attrFilter.add(new Option(attr, attr)));
}

function applyFilters() {
    let targetLevel = document.getElementById('filter-level').value;
    let targetAttr = document.getElementById('filter-attribute').value;
    let updateNodes = nodesDataset.get().map(node => {
        let mon = db[node.id];
        node.hidden = !((targetLevel === "All" || mon.level === targetLevel) && (targetAttr === "All" || mon.attribute === targetAttr));
        return node;
    });
    nodesDataset.update(updateNodes);
    network.fit({ animation: true });
}

function exportGraphToPNG() {
    let canvas = document.getElementById('mynetwork').getElementsByTagName('canvas')[0];
    let downloadLink = document.createElement('a');
    downloadLink.href = canvas.toDataURL("image/png");
    downloadLink.download = 'Digimon_Line.png';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

// --- Multi-Stop Routing Engine ---
function findMultiRoute(useKarnEX) {
    let selects = Array.from(document.querySelectorAll('.route-node')).map(s => s.value).filter(Boolean);
    if (selects.length < 2) return alert("Please select at least a Start and Target Digimon.");
    
    let allowDedigivolve = document.getElementById('allow-dedigivolve').checked;
    document.getElementById('route-readout').innerHTML = "Calculating segments...";

    let fullPathNodes = [];
    let fullPathEdges = [];
    let totalCost = 0;

    // Stitch segments together
    for (let i = 0; i < selects.length - 1; i++) {
        let start = selects[i];
        let end = selects[i+1];
        let res = useKarnEX ? executeKarnEX(start, end, allowDedigivolve) : executeBFS(start, end, allowDedigivolve);
        
        if (!res) {
            document.getElementById('route-readout').innerHTML = `<span style="color:red">Broken link between ${start} and ${end}.</span>`;
            return;
        }

        if (i === 0) fullPathNodes.push(...res.nodes);
        else fullPathNodes.push(...res.nodes.slice(1)); // avoid duplicating the waypoint node
        
        fullPathEdges.push(...res.edges);
        totalCost += res.cost || 0;
    }

    if(useKarnEX) injectVirtualEdges(fullPathEdges);
    displayStitchedRoute(fullPathNodes, fullPathEdges, useKarnEX ? "KarnEX Stitched Route" : "Canonical Stitched Route", totalCost);
}

function displayStitchedRoute(nodes, edges, title, cost) {
    let html = `<strong>${title}</strong><br>Cost: ${cost}<br><div style="margin-top:5px; background:#222; padding:5px; border:1px solid #444;">${nodes.join(" ➔ ")}</div>`;
    document.getElementById('route-readout').innerHTML = html;
    applyHighlight(nodes[0], edges); // Highlight specific path
}

// Single segment algorithms
function executeBFS(start, end, allowDedigivolve) {
    let queue = [{ current: start, pathNodes: [start], pathEdges: [] }];
    let visited = new Set([start]);

    while (queue.length > 0) {
        let { current, pathNodes, pathEdges } = queue.shift();
        if (current === end) return { nodes: pathNodes, edges: pathEdges };

        let currentMon = db[current];
        let cLevel = levelMap[currentMon.level] || 8;
        
        let nextSteps = [];
        currentMon.evolves_to.forEach(n => { if(db[n] && (allowDedigivolve || (levelMap[db[n].level]||8) > cLevel)) nextSteps.push({id: n, edge: `${current}->${n}`}); });
        if(allowDedigivolve) currentMon.evolves_from.forEach(p => { if(db[p]) nextSteps.push({id: p, edge: `${p}->${current}`}); });

        for (let step of nextSteps) {
            if (!visited.has(step.id)) {
                visited.add(step.id);
                queue.push({ current: step.id, pathNodes: [...pathNodes, step.id], pathEdges: [...pathEdges, step.edge] });
            }
        }
    }
    return null;
}

function calculateKarnEXCost(monA, monB) {
    let cost = 100;
    if (monA.attribute && monA.attribute === monB.attribute) cost -= 20;
    if (monA.type && monA.type === monB.type) cost -= 20;
    
    let baseA = monA.name.replace(/mon$/i, ''), baseB = monB.name.replace(/mon$/i, '');
    if (baseA.length > 3 && monB.name.includes(baseA)) cost -= 35;
    if (baseB.length > 3 && monA.name.includes(baseB)) cost -= 35;
    
    let sFields = monA.fields.filter(f => monB.fields.includes(f));
    cost -= (sFields.length * 10);
    
    if (monA.traits && monB.traits) {
        let sTraits = monA.traits.filter(t => monB.traits.includes(t));
        if (sTraits.length === 1) cost -= 5;
        else if (sTraits.length === 2) cost -= 20;
        else if (sTraits.length >= 3) cost -= (sTraits.length * 15);
    }
    return Math.max(5, cost);
}

function executeKarnEX(start, end, allowDedigivolve) {
    let pq = [{ current: start, pathNodes: [start], pathEdges: [], totalCost: 0 }];
    let minCost = new Map();
    minCost.set(start, 0);

    let iterations = 0;
    while (pq.length > 0 && iterations < 3000) {
        pq.sort((a, b) => a.totalCost - b.totalCost);
        let { current, pathNodes, pathEdges, totalCost } = pq.shift();
        iterations++;
        
        if (current === end) return { nodes: pathNodes, edges: pathEdges, cost: totalCost };
        
        let cMon = db[current];
        let cLvl = levelMap[cMon.level] || 8;
        
        let targets = dbArray.filter(m => {
            let tLvl = levelMap[m.level] || 8;
            return allowDedigivolve ? Math.abs(tLvl - cLvl) === 1 : tLvl === cLvl + 1;
        });

        for (let t of targets) {
            let stepCost = calculateKarnEXCost(cMon, t);
            let nCost = totalCost + stepCost;
            if (!minCost.has(t.name) || nCost < minCost.get(t.name)) {
                minCost.set(t.name, nCost);
                pq.push({ current: t.name, pathNodes: [...pathNodes, t.name], pathEdges: [...pathEdges, `${current}-karnex->${t.name}`], totalCost: nCost });
            }
        }
    }
    return null;
}

function injectVirtualEdges(customEdges) {
    let existing = edgesDataset.getIds();
    let newEdges = [];
    customEdges.forEach(eId => {
        if (!existing.includes(eId) && eId.includes("-karnex->")) {
            let [from, to] = eId.split("-karnex->");
            newEdges.push({ id: eId, from: from, to: to, arrows: 'to', color: { color: '#a142f5', opacity: 1 }, width: 3, dashes: [10, 10] });
            virtualEdgeIds.push(eId);
        }
    });
    if (newEdges.length > 0) edgesDataset.add(newEdges);
}


// --- THE LINE MAKER MODE (Grid Builder) ---
let lmState = {}; // colIndex -> [mon1, mon2...]
let activeLmCol = null;
let lmLevels = ["Baby I", "Baby II", "Child", "Adult", "Perfect", "Ultimate", "Super Ultimate"];

function initLineMaker() {
    let container = document.getElementById('lm-container');
    container.innerHTML = '';
    lmLevels.forEach((lvl, colIndex) => {
        lmState[colIndex] = [];
        let col = document.createElement('div');
        col.className = 'lm-col';
        col.innerHTML = `<h4>${lvl}</h4><div id="lm-slots-${colIndex}"></div>
                         <button style="background:#555; font-size:12px;" onclick="openSuggestionModal(${colIndex})">+ Add Branch</button>`;
        container.appendChild(col);
        renderLmSlots(colIndex);
    });
}

function renderLmSlots(colIndex) {
    let div = document.getElementById(`lm-slots-${colIndex}`);
    div.innerHTML = '';
    lmState[colIndex].forEach((monName, slotIndex) => {
        let mon = db[monName];
        div.innerHTML += `<div class="lm-slot" onclick="removeLmSlot(${colIndex}, ${slotIndex})">
                            <img src="${mon.image_url || 'https://via.placeholder.com/60'}"><br>
                            <span style="font-size:11px;">${mon.english_name || mon.name}</span>
                          </div>`;
    });
}

function removeLmSlot(col, slot) {
    lmState[col].splice(slot, 1);
    renderLmSlots(col);
}

// Modal Logic
let currentModalOptions = [];

function openSuggestionModal(targetColIndex) {
    activeLmCol = targetColIndex;
    let targetLevelStr = lmLevels[targetColIndex];
    let targetLvlNum = levelMap[targetLevelStr];

    // Find predecessors in the previous column to generate smart suggestions
    let prevMons = targetColIndex > 0 ? lmState[targetColIndex - 1].map(name => db[name]) : [];
    
    let suggestions = [];
    
    // 1. Filter entire DB to only Digimon of the target level
    let validTargets = dbArray.filter(m => levelMap[m.level] === targetLvlNum);

    validTargets.forEach(tMon => {
        let isCanon = false;
        let bestKarnCost = Infinity;

        // If no predecessor, just list them alphabetically
        if(prevMons.length === 0) {
            suggestions.push({ mon: tMon, type: 'pool', score: 0 });
            return;
        }

        prevMons.forEach(pMon => {
            if (pMon.evolves_to.includes(tMon.name)) isCanon = true;
            let kCost = calculateKarnEXCost(pMon, tMon);
            if(kCost < bestKarnCost) bestKarnCost = kCost;
        });

        if (isCanon) suggestions.push({ mon: tMon, type: 'canon', score: -100 });
        else suggestions.push({ mon: tMon, type: 'karnex', score: bestKarnCost });
    });

    // Sort: Canon first, then KarnEX Lowest Cost, then alphabetical
    suggestions.sort((a, b) => {
        if(a.score !== b.score) return a.score - b.score;
        return a.mon.name.localeCompare(b.mon.name);
    });

    // Take top 50 to prevent DOM lag
    currentModalOptions = suggestions.slice(0, 100);
    renderModalList();
    document.getElementById('suggestion-modal').style.display = 'flex';
    document.getElementById('modal-search').value = '';
}

function renderModalList(filterText = "") {
    let listDiv = document.getElementById('modal-suggestions');
    listDiv.innerHTML = '';
    
    currentModalOptions.forEach(sug => {
        if(filterText && !sug.mon.name.toLowerCase().includes(filterText) && !(sug.mon.english_name||'').toLowerCase().includes(filterText)) return;
        
        let badge = sug.type === 'canon' ? '<span class="sug-canon">★ Official</span>' : 
                    sug.type === 'karnex' ? `<span class="sug-karnex">💡 KarnEX (Score: ${sug.score})</span>` : '';
        
        listDiv.innerHTML += `
            <div class="suggestion-card" onclick="selectForLineMaker('${sug.mon.name}')">
                <img src="${sug.mon.image_url || 'https://via.placeholder.com/40'}">
                <div>
                    <div style="font-size:13px; font-weight:bold;">${sug.mon.english_name || sug.mon.name}</div>
                    ${badge}
                </div>
            </div>
        `;
    });
}

function filterModalSearch() {
    let txt = document.getElementById('modal-search').value.toLowerCase();
    renderModalList(txt);
}

function selectForLineMaker(monName) {
    if(activeLmCol !== null) {
        if(!lmState[activeLmCol].includes(monName)) {
            lmState[activeLmCol].push(monName);
            renderLmSlots(activeLmCol);
        }
    }
    document.getElementById('suggestion-modal').style.display = 'none';
}