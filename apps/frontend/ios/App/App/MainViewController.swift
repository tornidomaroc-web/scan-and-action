import Capacitor
import UIKit

// The bridge view controller, subclassed for one reason: to register the
// plugins that live in the app target. Packages under node_modules register
// themselves; a class compiled into the app does not. Main.storyboard names
// this class.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DocumentScannerPlugin())
        #if targetEnvironment(simulator)
        let asked = ProcessInfo.processInfo.environment["SA_LAUNCH_SMOKE"] == "1"
            || CommandLine.arguments.contains("--sa-launch-smoke")
        // The universal link check opens the app through the system, which
        // passes no environment or argument, so it asks with a file instead.
        let watch = FileManager.default.fileExists(atPath: Self.watchFlag.path)
        NSLog("[LaunchSmoke] capacitorDidLoad asked=%d watch=%d tmp=%@", asked ? 1 : 0, watch ? 1 : 0, FileManager.default.temporaryDirectory.path)
        if asked || watch {
            // At once, before anything asynchronous: this line alone says the
            // storyboard instantiated this class.
            writeLaunchMarker(attempt: -1, page: "{\"ready\":\"not-asked-yet\"}")
            writeLaunchSmoke(attempt: 0, watch: watch)
        }
        #endif
    }

    // The launch smoke test (ios-audit.yml). A storyboard that names a class
    // the runtime cannot find still builds; the app then opens on an empty
    // view controller. So the audit starts the app in a simulator with
    // SA_LAUNCH_SMOKE=1 and reads the file written here: it exists only if
    // THIS class was instantiated, and it says what the web view holds.
    // Compiled for the simulator only; a device build carries none of it.
    #if targetEnvironment(simulator)
    // Present only in the simulator's data container, written by the check in
    // ios-audit.yml. While it exists the marker keeps being rewritten for the
    // whole window, so a link opened into a running app shows up in it.
    private static let watchFlag = FileManager.default
        .urls(for: .libraryDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("sa-smoke-watch")

    private func writeLaunchMarker(attempt: Int, page: String) {
        let controller = String(describing: type(of: self))
        let line = "{\"attempt\":\(attempt),\"controller\":\"\(controller)\",\"page\":\(page)}\n"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("launch-smoke.json")
        do {
            try line.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            NSLog("[LaunchSmoke] write failed: %@", String(describing: error))
        }
    }

    private func writeLaunchSmoke(attempt: Int, watch: Bool) {
        let probe = """
        JSON.stringify({
          ready: document.readyState,
          href: location.href,
          native: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
          scanner: !!(window.Capacitor && window.Capacitor.PluginHeaders && window.Capacitor.PluginHeaders.some(function (h) { return h.name === 'DocumentScanner'; })),
          root: !!document.getElementById('root'),
          confirm: (function () { var e = document.querySelector('[data-auth-confirm]'); return e ? e.getAttribute('data-auth-confirm') : null; })()
        })
        """
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            guard let self = self else { return }
            guard let webView = self.webView else {
                self.writeLaunchMarker(attempt: attempt, page: "{\"ready\":\"no-webview\"}")
                if attempt < 240 { self.writeLaunchSmoke(attempt: attempt + 1, watch: watch) }
                return
            }
            webView.evaluateJavaScript(probe) { value, error in
                let failure = error.map { String(describing: type(of: $0)) } ?? "none"
                let page = (value as? String) ?? "{\"ready\":\"no-result\",\"error\":\"\(failure)\"}"
                self.writeLaunchMarker(attempt: attempt, page: page)
                let done = !watch && page.contains("\"ready\":\"complete\"") && page.contains("\"scanner\":true")
                if !done && attempt < 240 { self.writeLaunchSmoke(attempt: attempt + 1, watch: watch) }
            }
        }
    }
    #endif
}
