/* ==============================
   TaskFlow — Application Logic
   ============================== */

(function () {
    'use strict';

    // ──────────── State ────────────
    let tasks = []; // { id, name, prerequisites: [id, ...] }
    let nextId = 1;
    let editingTaskId = null; // id of task currently being edited, or null

    // ──────────── DOM refs ────────────
    const form = document.getElementById('add-task-form');
    const nameInput = document.getElementById('task-name-input');
    const prereqSelect = document.getElementById('prereq-select');
    const prereqEmpty = document.getElementById('prereq-empty');
    const taskList = document.getElementById('task-list');
    const taskListEmpty = document.getElementById('task-list-empty');
    const taskCount = document.getElementById('task-count');
    const rankingList = document.getElementById('ranking-list');
    const rankingEmpty = document.getElementById('ranking-empty');
    const graphContainer = document.getElementById('graph-container');
    const graphEmpty = document.getElementById('graph-empty');
    const btnRecenter = document.getElementById('btn-recenter');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');

    // ──────────── Persistence ────────────
    function save() {
        localStorage.setItem('taskflow_tasks', JSON.stringify(tasks));
        localStorage.setItem('taskflow_nextId', JSON.stringify(nextId));
    }

    function load() {
        try {
            const t = JSON.parse(localStorage.getItem('taskflow_tasks'));
            const n = JSON.parse(localStorage.getItem('taskflow_nextId'));
            if (Array.isArray(t)) tasks = t;
            if (typeof n === 'number') nextId = n;
        } catch (e) { /* ignore */ }
    }

    // ──────────── Dependency helpers ────────────
    /**
     * Count how many tasks (transitively) depend on a given task.
     * A task X "depends on" task T if T is in X's prerequisites (direct) or
     * T is a prerequisite of something X depends on (transitive).
     */
    function countDependents(taskId) {
        const dependents = new Set();
        function walk(tid) {
            for (const t of tasks) {
                if (!dependents.has(t.id) && t.prerequisites.includes(tid)) {
                    dependents.add(t.id);
                    walk(t.id);
                }
            }
        }
        walk(taskId);
        return dependents.size;
    }

    /** Return max dependents count across all tasks (for normalization) */
    function maxDependents() {
        let mx = 0;
        for (const t of tasks) {
            mx = Math.max(mx, countDependents(t.id));
        }
        return mx;
    }

    /**
     * Count all transitive dependencies of a task (prerequisites of prerequisites,
     * all the way down the graph).
     */
    function countTransitiveDependencies(taskId) {
        const deps = new Set();
        function walk(tid) {
            const task = tasks.find(t => t.id === tid);
            if (!task) return;
            for (const pid of task.prerequisites) {
                if (!deps.has(pid)) {
                    deps.add(pid);
                    walk(pid);
                }
            }
        }
        walk(taskId);
        return deps.size;
    }

    /** Return max transitive dependency count across all tasks */
    function maxTransitiveDependencies() {
        let mx = 0;
        for (const t of tasks) {
            mx = Math.max(mx, countTransitiveDependencies(t.id));
        }
        return mx;
    }

    // ──────────── Render: Prerequisite selector ────────────
    function renderPrereqSelect() {
        // Remove old checkboxes (but keep #prereq-empty)
        prereqSelect.querySelectorAll('label').forEach(l => l.remove());

        // Filter out the task being edited (can't be its own prerequisite)
        const available = tasks.filter(t => t.id !== editingTaskId);

        if (available.length === 0) {
            prereqEmpty.style.display = '';
            return;
        }
        prereqEmpty.style.display = 'none';

        for (const t of available) {
            const lbl = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = t.id;
            cb.dataset.taskId = t.id;
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(t.name));
            prereqSelect.appendChild(lbl);
        }
    }

    // ──────────── Render: Task list ────────────
    function renderTaskList() {
        // Remove old items
        taskList.querySelectorAll('.task-item').forEach(el => el.remove());
        taskCount.textContent = tasks.length;

        if (tasks.length === 0) {
            taskListEmpty.style.display = '';
            return;
        }
        taskListEmpty.style.display = 'none';

        for (const t of tasks) {
            const li = document.createElement('li');
            li.className = 'task-item';
            if (editingTaskId === t.id) li.classList.add('task-item-editing');
            li.dataset.id = t.id;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'task-item-name';
            nameSpan.textContent = t.name;
            nameSpan.title = t.name;

            const depCount = t.prerequisites.length;
            const depSpan = document.createElement('span');
            depSpan.className = 'task-item-deps';
            depSpan.textContent = depCount > 0 ? `${depCount} dep${depCount > 1 ? 's' : ''}` : '';

            const btnGroup = document.createElement('div');
            btnGroup.className = 'task-item-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'task-edit-btn';
            editBtn.title = 'Edit task';
            editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10.5 1.5l2 2-7.5 7.5H3v-2l7.5-7.5z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><line x1="8" y1="4" x2="10" y2="6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
            editBtn.addEventListener('click', () => openEditMode(t.id));

            const delBtn = document.createElement('button');
            delBtn.className = 'task-delete-btn';
            delBtn.title = 'Delete task';
            delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
            delBtn.addEventListener('click', () => deleteTask(t.id));

            btnGroup.appendChild(editBtn);
            btnGroup.appendChild(delBtn);

            li.appendChild(nameSpan);
            li.appendChild(depSpan);
            li.appendChild(btnGroup);
            taskList.appendChild(li);
        }
    }

    // ──────────── Render: Rankings ────────────
    function renderRankings() {
        rankingList.querySelectorAll('.ranking-item').forEach(el => el.remove());

        // Build ranking data — rank by total transitive dependencies
        const ranked = tasks.map(t => ({
            id: t.id,
            name: t.name,
            score: countTransitiveDependencies(t.id)
        })).sort((a, b) => b.score - a.score);

        if (ranked.length === 0) {
            rankingEmpty.style.display = '';
            return;
        }
        rankingEmpty.style.display = 'none';
        const maxScore = Math.max(ranked[0].score, 1);

        ranked.forEach((r, i) => {
            const li = document.createElement('li');
            li.className = 'ranking-item';

            const pos = document.createElement('span');
            pos.className = 'ranking-position ' + (i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal');
            pos.textContent = i + 1;

            const info = document.createElement('div');
            info.className = 'ranking-info';
            const rName = document.createElement('div');
            rName.className = 'ranking-name';
            rName.textContent = r.name;
            rName.title = r.name;
            const rScore = document.createElement('div');
            rScore.className = 'ranking-score';
            rScore.textContent = r.score === 0 ? 'no dependencies' : `${r.score} total dependenc${r.score > 1 ? 'ies' : 'y'}`;
            info.appendChild(rName);
            info.appendChild(rScore);

            const barContainer = document.createElement('div');
            barContainer.className = 'ranking-bar-container';
            const bar = document.createElement('div');
            bar.className = 'ranking-bar';
            bar.style.width = `${(r.score / maxScore) * 100}%`;
            barContainer.appendChild(bar);

            li.appendChild(pos);
            li.appendChild(info);
            li.appendChild(barContainer);
            rankingList.appendChild(li);
        });
    }

    // ──────────── Add / Edit / Delete Tasks ────────────
    function addTask(name, prerequisites) {
        const task = { id: nextId++, name, prerequisites };
        tasks.push(task);
        save();
        renderAll();
    }

    function updateTask(id, name, prerequisites) {
        const task = tasks.find(t => t.id === id);
        if (!task) return;
        task.name = name;
        task.prerequisites = prerequisites;
        save();
        renderAll();
    }

    function deleteTask(id) {
        if (editingTaskId === id) cancelEditMode();
        tasks = tasks.filter(t => t.id !== id);
        // Remove from all prerequisite lists
        for (const t of tasks) {
            t.prerequisites = t.prerequisites.filter(pid => pid !== id);
        }
        save();
        renderAll();
    }

    // ──────────── Edit mode ────────────
    const addTaskBtn = document.getElementById('add-task-btn');
    const addTaskSection = document.getElementById('add-task-section');
    let editBar = null; // cancel/save bar element

    function openEditMode(taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        editingTaskId = taskId;

        // Populate form with task data
        nameInput.value = task.name;
        nameInput.focus();

        // Re-render prereq select excluding the task being edited (can't depend on self)
        renderPrereqSelect();

        // Check the current prerequisites
        prereqSelect.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = task.prerequisites.includes(Number(cb.value));
        });

        // Change form heading
        addTaskSection.querySelector('h2').textContent = 'Edit Task';

        // Swap button
        addTaskBtn.style.display = 'none';

        // Add edit bar if not present
        if (!editBar) {
            editBar = document.createElement('div');
            editBar.className = 'edit-bar';
            editBar.innerHTML = `
                <button type="button" id="edit-cancel-btn" class="edit-bar-btn cancel">Cancel</button>
                <button type="submit" id="edit-save-btn" class="edit-bar-btn save">Save Changes</button>
            `;
            form.appendChild(editBar);
            editBar.querySelector('#edit-cancel-btn').addEventListener('click', cancelEditMode);
        }
        editBar.style.display = '';

        // Highlight the task in the list
        renderTaskList();
    }

    function cancelEditMode() {
        editingTaskId = null;
        nameInput.value = '';
        addTaskSection.querySelector('h2').textContent = 'Add Task';
        addTaskBtn.style.display = '';
        if (editBar) editBar.style.display = 'none';
        prereqSelect.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = false));
        renderPrereqSelect();
        renderTaskList();
    }

    // ──────────── Form handler ────────────
    form.addEventListener('submit', e => {
        e.preventDefault();
        const name = nameInput.value.trim();
        if (!name) return;

        const checked = prereqSelect.querySelectorAll('input[type="checkbox"]:checked');
        const prereqs = Array.from(checked).map(cb => Number(cb.value));

        if (editingTaskId !== null) {
            updateTask(editingTaskId, name, prereqs);
            cancelEditMode();
        } else {
            addTask(name, prereqs);
        }
        nameInput.value = '';
        // Uncheck all
        prereqSelect.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = false));
        nameInput.focus();
    });

    // ──────────── D3 Network Graph ────────────
    let svg, gRoot, simulation, zoomBehavior;

    function initGraph() {
        const rect = graphContainer.getBoundingClientRect();
        svg = d3.select(graphContainer)
            .append('svg')
            .attr('width', rect.width)
            .attr('height', rect.height);

        // Arrowhead marker
        svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 22)
            .attr('refY', 0)
            .attr('markerWidth', 8)
            .attr('markerHeight', 8)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('class', 'graph-arrowhead');

        gRoot = svg.append('g');

        zoomBehavior = d3.zoom()
            .scaleExtent([0.2, 4])
            .on('zoom', e => gRoot.attr('transform', e.transform));
        svg.call(zoomBehavior);
    }

    function updateGraph() {
        if (tasks.length === 0) {
            graphEmpty.style.display = '';
            gRoot.selectAll('*').remove();
            if (simulation) simulation.stop();
            return;
        }
        graphEmpty.style.display = 'none';

        const rect = graphContainer.getBoundingClientRect();
        const W = rect.width;
        const H = rect.height;

        svg.attr('width', W).attr('height', H);

        // Build nodes & links
        const mx = maxDependents();
        const nodes = tasks.map(t => {
            const deps = countDependents(t.id);
            return {
                id: t.id,
                name: t.name,
                deps,
                // Target Y: tasks with more dependents higher up
                targetY: mx > 0 ? H * 0.15 + (1 - deps / mx) * H * 0.7 : H / 2,
                radius: 12 + (mx > 0 ? (deps / mx) * 10 : 0),
                color: mx > 0 && deps > mx * 0.6 ? '#a78bfa'
                    : mx > 0 && deps > mx * 0.25 ? '#6366f1'
                    : '#3b3b6b'
            };
        });

        // Links: from task → its prerequisite (arrow points to prerequisite, meaning "depends on")
        const links = [];
        for (const t of tasks) {
            for (const pid of t.prerequisites) {
                if (tasks.find(x => x.id === pid)) {
                    links.push({ source: t.id, target: pid });
                }
            }
        }

        // Restart simulation
        if (simulation) simulation.stop();

        simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(100).strength(0.5))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(W / 2, H / 2))
            .force('y', d3.forceY(d => d.targetY).strength(0.35))
            .force('collide', d3.forceCollide(d => d.radius + 8))
            .alphaDecay(0.03);

        // ---- Links
        const linkSel = gRoot.selectAll('.graph-link').data(links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);
        linkSel.exit().remove();
        const linkEnter = linkSel.enter().append('line')
            .attr('class', 'graph-link')
            .attr('marker-end', 'url(#arrowhead)');
        const allLinks = linkEnter.merge(linkSel);

        // ---- Nodes
        const nodeSel = gRoot.selectAll('.graph-node').data(nodes, d => d.id);
        nodeSel.exit().remove();
        const nodeEnter = nodeSel.enter().append('g')
            .attr('class', 'graph-node')
            .call(d3.drag()
                .on('start', dragStarted)
                .on('drag', dragged)
                .on('end', dragEnded));

        nodeEnter.append('circle')
            .attr('class', 'graph-node-circle');

        nodeEnter.append('text')
            .attr('class', 'graph-node-label')
            .attr('dy', d => d.radius + 16);

        const allNodes = nodeEnter.merge(nodeSel);

        allNodes.select('circle')
            .attr('r', d => d.radius)
            .attr('fill', d => d.color);

        allNodes.select('text')
            .text(d => d.name.length > 18 ? d.name.slice(0, 16) + '…' : d.name)
            .attr('dy', d => d.radius + 16);

        simulation.on('tick', () => {
            allLinks
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            allNodes.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        function dragStarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        function dragEnded(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
    }

    // ──────────── Graph controls ────────────
    btnRecenter.addEventListener('click', () => {
        svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
    });
    btnZoomIn.addEventListener('click', () => {
        svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.4);
    });
    btnZoomOut.addEventListener('click', () => {
        svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.7);
    });

    // ──────────── Resize handler ────────────
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const rect = graphContainer.getBoundingClientRect();
            svg.attr('width', rect.width).attr('height', rect.height);
            if (simulation) {
                simulation.force('center', d3.forceCenter(rect.width / 2, rect.height / 2));
                simulation.alpha(0.3).restart();
            }
        }, 200);
    });

    // ──────────── Render all ────────────
    function renderAll() {
        renderPrereqSelect();
        renderTaskList();
        renderRankings();
        updateGraph();
    }

    // ──────────── App Class ────────────
    class TaskFlowApp {
        start() {
            load();
            initGraph();
            renderAll();
        }
    }

    // ──────────── Init ────────────
    const app = new TaskFlowApp();
    app.start();
})();
