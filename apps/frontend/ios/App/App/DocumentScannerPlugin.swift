import Capacitor
import UIKit
import VisionKit

// ============================================================================
// The system document scanner, for the capture sheet (design step 3, the loop).
//
// A local plugin in the app target, not a package: it wraps Apple's
// VNDocumentCameraViewController through its public API only (present, the
// three delegate callbacks, pageCount, imageOfPage). The one maintained
// third-party plugin that wraps the same controller reaches into private
// classes to cap the page count (read 2026-09-30); nothing here does, and
// `iosPlatform.test.ts` plus the binary audit hold that.
//
// WHAT IT RETURNS. One file the upload route already accepts (JPEG or PDF, at
// most `maxBytes`), written to the app's temporary directory:
//   one page    -> a JPEG, long side at most 3000 px
//   many pages  -> ONE PDF, a page per scan, in the order scanned
// The web side reads the file, uploads it through the existing path and asks
// for it to be removed (`discard`). Nothing is kept and nothing is sent
// anywhere from here.
//
// WHY ONE PDF. A long receipt carries its total on the last page, and the
// total is the one field extraction may not miss; sending the first page
// alone would drop it. The backend accepts a PDF and hands it to the model
// whole (`documentRoutes.ts`, `geminiAdapter.ts`).
//
// The JavaScript interface (`src/native/documentScanner.ts`) is the contract:
// isSupported / scan / discard. An Android implementation over ML Kit's
// document scanner registers under the same name with the same three methods.
// ============================================================================

@objc(DocumentScannerPlugin)
public class DocumentScannerPlugin: CAPPlugin, CAPBridgedPlugin, VNDocumentCameraViewControllerDelegate {
    public let identifier = "DocumentScannerPlugin"
    public let jsName = "DocumentScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discard", returnType: CAPPluginReturnPromise)
    ]

    private static let filePrefix = "scan-"
    private static let defaultMaxBytes = 10 * 1024 * 1024

    // Tried in order for a multi-page scan until the PDF fits `maxBytes`.
    private static let pdfAttempts: [(maxSide: CGFloat, quality: CGFloat)] = [
        (2400, 0.8), (2000, 0.65), (1600, 0.5), (1200, 0.4)
    ]

    private var pendingCall: CAPPluginCall?
    private var maxBytes = DocumentScannerPlugin.defaultMaxBytes

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": VNDocumentCameraViewController.isSupported])
    }

    @objc func scan(_ call: CAPPluginCall) {
        let requested = call.getInt("maxBytes") ?? DocumentScannerPlugin.defaultMaxBytes
        DispatchQueue.main.async {
            guard VNDocumentCameraViewController.isSupported else {
                call.reject("The document scanner is not supported on this device.", "UNSUPPORTED")
                return
            }
            guard self.pendingCall == nil else {
                call.reject("A scan is already in progress.", "BUSY")
                return
            }
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller to present the scanner from.", "NO_PRESENTER")
                return
            }
            self.maxBytes = requested > 0 ? requested : DocumentScannerPlugin.defaultMaxBytes
            self.pendingCall = call
            let scanner = VNDocumentCameraViewController()
            scanner.delegate = self
            presenter.present(scanner, animated: true)
        }
    }

    @objc func discard(_ call: CAPPluginCall) {
        // Only a file this plugin wrote, in the temporary directory.
        guard let raw = call.getString("path"), let url = URL(string: raw), url.isFileURL else {
            call.resolve()
            return
        }
        let tmp = FileManager.default.temporaryDirectory.standardizedFileURL.path
        let target = url.standardizedFileURL
        if target.path.hasPrefix(tmp), target.lastPathComponent.hasPrefix(DocumentScannerPlugin.filePrefix) {
            try? FileManager.default.removeItem(at: target)
        }
        call.resolve()
    }

    // MARK: - VNDocumentCameraViewControllerDelegate

    public func documentCameraViewController(
        _ controller: VNDocumentCameraViewController,
        didFinishWith scan: VNDocumentCameraScan
    ) {
        let limit = maxBytes
        controller.dismiss(animated: true)
        DispatchQueue.global(qos: .userInitiated).async {
            let outcome = DocumentScannerPlugin.write(scan: scan, maxBytes: limit)
            DispatchQueue.main.async {
                guard let call = self.pendingCall else { return }
                self.pendingCall = nil
                switch outcome {
                case .success(let file):
                    call.resolve([
                        "status": "success",
                        "path": file.url.absoluteString,
                        "mimeType": file.mimeType,
                        "pageCount": file.pageCount,
                        "bytes": file.bytes
                    ])
                case .failure(let failure):
                    call.reject(failure.message, failure.code)
                }
            }
        }
    }

    public func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
        let call = pendingCall
        pendingCall = nil
        call?.resolve(["status": "cancel"])
    }

    public func documentCameraViewController(
        _ controller: VNDocumentCameraViewController,
        didFailWithError error: Error
    ) {
        controller.dismiss(animated: true)
        let call = pendingCall
        pendingCall = nil
        // The system's own description; it carries no document content.
        call?.reject(error.localizedDescription, "SCANNER_FAILED")
    }

    // MARK: - Encoding

    private struct ScanFile {
        let url: URL
        let mimeType: String
        let pageCount: Int
        let bytes: Int
    }

    private struct ScanFailure: Error {
        let code: String
        let message: String
    }

    private static func write(scan: VNDocumentCameraScan, maxBytes: Int) -> Result<ScanFile, ScanFailure> {
        let pageCount = scan.pageCount
        guard pageCount > 0 else {
            return .failure(ScanFailure(code: "NO_PAGES", message: "The scan holds no page."))
        }
        if pageCount == 1 {
            return writeSinglePage(scan.imageOfPage(at: 0), maxBytes: maxBytes)
        }
        for attempt in pdfAttempts {
            var pages: [Data] = []
            pages.reserveCapacity(pageCount)
            var encodedBytes = 0
            for index in 0 ..< pageCount {
                let data: Data? = autoreleasepool {
                    scaled(scan.imageOfPage(at: index), maxSide: attempt.maxSide)
                        .jpegData(compressionQuality: attempt.quality)
                }
                guard let page = data else {
                    return .failure(ScanFailure(code: "ENCODE_FAILED", message: "A scanned page could not be encoded."))
                }
                encodedBytes += page.count
                pages.append(page)
                if encodedBytes > maxBytes { break }
            }
            if encodedBytes > maxBytes { continue }
            let pdf = makePDF(jpegPages: pages)
            if pdf.count <= maxBytes {
                return save(pdf, ext: "pdf", mimeType: "application/pdf", pageCount: pageCount)
            }
        }
        return .failure(ScanFailure(code: "TOO_LARGE", message: "The scan is too large to send as one document."))
    }

    private static func writeSinglePage(_ image: UIImage, maxBytes: Int) -> Result<ScanFile, ScanFailure> {
        let attempts: [(maxSide: CGFloat, quality: CGFloat)] = [(3000, 0.85), (2400, 0.7), (1800, 0.55)]
        for attempt in attempts {
            guard let data = scaled(image, maxSide: attempt.maxSide).jpegData(compressionQuality: attempt.quality) else {
                return .failure(ScanFailure(code: "ENCODE_FAILED", message: "The scanned page could not be encoded."))
            }
            if data.count <= maxBytes {
                return save(data, ext: "jpg", mimeType: "image/jpeg", pageCount: 1)
            }
        }
        return .failure(ScanFailure(code: "TOO_LARGE", message: "The scan is too large to send."))
    }

    private static func save(_ data: Data, ext: String, mimeType: String, pageCount: Int) -> Result<ScanFile, ScanFailure> {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(filePrefix)\(UUID().uuidString).\(ext)")
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            return .failure(ScanFailure(code: "WRITE_FAILED", message: "The scan could not be saved."))
        }
        return .success(ScanFile(url: url, mimeType: mimeType, pageCount: pageCount, bytes: data.count))
    }

    /// The image with its long side at most `maxSide` pixels, upright, at scale 1.
    private static func scaled(_ image: UIImage, maxSide: CGFloat) -> UIImage {
        let width = image.size.width * image.scale
        let height = image.size.height * image.scale
        let longest = max(width, height)
        let factor = longest > maxSide ? maxSide / longest : 1
        let size = CGSize(width: max(1, (width * factor).rounded()), height: max(1, (height * factor).rounded()))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }

    /// One PDF page per JPEG, each page the size of its image.
    private static func makePDF(jpegPages: [Data]) -> Data {
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 612, height: 792))
        return renderer.pdfData { context in
            for jpeg in jpegPages {
                guard let page = UIImage(data: jpeg) else { continue }
                let bounds = CGRect(origin: .zero, size: page.size)
                context.beginPage(withBounds: bounds, pageInfo: [:])
                page.draw(in: bounds)
            }
        }
    }
}
