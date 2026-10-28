import SwiftUI
import WebKit

private let dashboardURL = URL(string: "https://clst-trucking.pages.dev/")!

struct ContentView: View {
    @State private var reloadID = UUID()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "circle.hexagongrid.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color(red: 0.30, green: 0.66, blue: 1.0))
                VStack(alignment: .leading, spacing: 1) {
                    Text("CLST TRUCKING AI")
                        .font(.system(size: 14, weight: .black, design: .rounded))
                        .tracking(1.1)
                    Text("Operations • Dispatch • ETA")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    reloadID = UUID()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 16, weight: .bold))
                        .frame(width: 40, height: 40)
                        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                }
                .accessibilityLabel("Reload dashboard")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color(red: 0.035, green: 0.04, blue: 0.06))

            DashboardWebView(url: dashboardURL, reloadID: reloadID)
                .id(reloadID)
                .background(Color(red: 0.035, green: 0.04, blue: 0.06))
        }
        .background(Color(red: 0.035, green: 0.04, blue: 0.06).ignoresSafeArea())
        .preferredColorScheme(.dark)
    }
}

private struct DashboardWebView: UIViewRepresentable {
    let url: URL
    let reloadID: UUID

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = false
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 45))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Reload is handled by recreating the view when reloadID changes.
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let target = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            let scheme = target.scheme?.lowercased() ?? ""
            if scheme != "https" && scheme != "http" {
                if UIApplication.shared.canOpenURL(target) {
                    UIApplication.shared.open(target)
                }
                decisionHandler(.cancel)
                return
            }

            // Keep the CLST dashboard inside the app. Open unrelated websites in Safari.
            if target.host == "clst-trucking.pages.dev" ||
               target.host == "clst-gmail-backend.clsttruckingllc.workers.dev" {
                decisionHandler(.allow)
            } else if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(target)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
        }
    }
}
