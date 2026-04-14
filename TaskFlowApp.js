class TaskFlowApp {
    start() {
        if (window.taskFlowCore) {
            window.taskFlowCore.load();
            window.taskFlowCore.initGraph();
            window.taskFlowCore.renderAll();
        }
    }
}

// Start the app
const app = new TaskFlowApp();
app.start();
