class TaskFlowAppStarter {
    start() {
        if (window.taskFlowCore) {
            window.taskFlowCore.load();
            window.taskFlowCore.initGraph();
            window.taskFlowCore.renderAll();
            
            const localLink = window.location.href;
            console.log(`🚀 TaskFlow App Starter is running!`);
            console.log(`🔗 Local link: ${localLink}`);
        }
    }
}

// Start the app
const app = new TaskFlowAppStarter();
app.start();
