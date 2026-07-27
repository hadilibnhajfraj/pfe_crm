{{flutter_js}}
{{flutter_build_config}}

_flutter.loader.load({
  serviceWorkerSettings: {
    serviceWorkerVersion: {{flutter_service_worker_version}}
  },
  onEntrypointLoaded: async function(engineInitializer) {
    // Run the app and hide the splash screen when the app is ready
    // (equivalent to the previous loadEntrypoint()-based logic).
    const appRunner = await engineInitializer.initializeEngine();
    await appRunner.runApp();
    const splashScreen = document.getElementById('splash-screen');
    if (splashScreen) {
      splashScreen.style.display = 'none';
    }
  }
});
