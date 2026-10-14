// The launch screen, rendered and measured (ios-audit.yml, "iOS — launch
// screen geometry"). A simulator screenshot cannot catch the real launch: it
// is gone before the first frame arrives (#323, runs 38636861009 and
// 38646101154). This app instead instantiates the SAME LaunchScreen.storyboard
// and asset catalog, compiled from the repository, at the simulator's real
// screen size, draws it, and prints what it shows: the mark's width as a share
// of the screen width and the background colour. The job fails outside the
// agreed range. No signing, no secrets, no network.
import UIKit

final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        let vc = UIStoryboard(name: "LaunchScreen", bundle: .main).instantiateInitialViewController()!
        window.rootViewController = vc
        window.makeKeyAndVisible()
        self.window = window
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { self.measure(window) }
        return true
    }

    private func measure(_ window: UIWindow) {
        let bounds = window.bounds
        let format = UIGraphicsImageRendererFormat.default()
        let image = UIGraphicsImageRenderer(bounds: bounds, format: format).image { _ in
            window.drawHierarchy(in: bounds, afterScreenUpdates: true)
        }
        guard let cg = image.cgImage else { print("PROBE {\"error\":\"no image\"}"); exit(2) }
        let w = cg.width, h = cg.height
        var px = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        func rgb(_ x: Int, _ y: Int) -> (Int, Int, Int) { let i = (y * w + x) * 4; return (Int(px[i]), Int(px[i + 1]), Int(px[i + 2])) }
        // The background: a pixel near the bottom edge, clear of any mark.
        let bg = rgb(w / 2, h - 4)
        // The mark: every row's extent of pixels that differ from the
        // background, widest over the middle third of the screen.
        var minX = w, maxX = -1
        for y in stride(from: h / 3, to: 2 * h / 3, by: 2) {
            for x in 0..<w {
                let c = rgb(x, y)
                if abs(c.0 - bg.0) + abs(c.1 - bg.1) + abs(c.2 - bg.2) > 60 { minX = min(minX, x); maxX = max(maxX, x) }
            }
        }
        let share = maxX >= minX ? Double(maxX - minX + 1) / Double(w) : 0
        let hex = String(format: "#%02X%02X%02X", bg.0, bg.1, bg.2)
        let json = "{\"screenPt\":\"\(Int(bounds.width))x\(Int(bounds.height))\",\"scale\":\(UIScreen.main.scale),\"px\":\"\(w)x\(h)\",\"markPx\":\(max(0, maxX - minX + 1)),\"markShare\":\(String(format: "%.4f", share)),\"background\":\"\(hex)\"}"
        print("PROBE \(json)")
        if let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            try? image.pngData()?.write(to: dir.appendingPathComponent("launch.png"))
        }
        fflush(stdout)
        exit(0)
    }
}

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(AppDelegate.self))
