import Capacitor
import UIKit

// The bridge view controller, subclassed for one reason: to register the
// plugins that live in the app target. Packages under node_modules register
// themselves; a class compiled into the app does not. Main.storyboard names
// this class.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DocumentScannerPlugin())
    }
}
