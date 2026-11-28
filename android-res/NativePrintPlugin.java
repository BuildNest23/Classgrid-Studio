package com.classgrid.app;

import android.app.Activity;
import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Custom Capacitor Android print plugin that forwards explicit PrintAttributes
 * (ISO A4 paper size, exact Landscape/Portrait orientation, Color mode, and
 * NO_MARGINS so CSS @page margins control layout cleanly without double margins).
 */
@CapacitorPlugin(name = "NativePrint")
public class NativePrintPlugin extends Plugin {
    // Keep a strong reference to the offscreen WebView until the next print job
    // so Android does not GC it while PrintDocumentAdapter is rendering pages.
    private WebView printWebView;

    @PluginMethod
    public void printHtml(PluginCall call) {
        final String html = call.getString("html");
        if (html == null || html.trim().isEmpty()) {
            call.reject("Missing HTML content to print.");
            return;
        }

        final String rawName = call.getString("name", "Document");
        final String jobName = (rawName == null || rawName.trim().isEmpty()) ? "Document" : rawName.trim();
        final String orientation = call.getString("orientation", "portrait");
        final String paperSize = call.getString("paperSize", "A4");
        final String colorMode = call.getString("colorMode", "color");

        final Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.reject("Android Activity is unavailable for printing.");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                final WebView webView = new WebView(activity);
                final WebSettings settings = webView.getSettings();
                settings.setJavaScriptEnabled(false);
                settings.setAllowFileAccess(false);
                settings.setAllowContentAccess(false);
                settings.setLoadsImagesAutomatically(true);
                settings.setBlockNetworkImage(false);

                final AtomicBoolean printTriggered = new AtomicBoolean(false);

                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        if (!printTriggered.compareAndSet(false, true)) {
                            return;
                        }
                        try {
                            PrintManager printManager =
                                (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                            if (printManager == null) {
                                call.reject("Android PrintManager service is unavailable.");
                                return;
                            }

                            PrintDocumentAdapter printAdapter = view.createPrintDocumentAdapter(jobName);

                            PrintAttributes.MediaSize baseMedia = resolveMediaSize(paperSize);
                            boolean isLandscape = "landscape".equalsIgnoreCase(orientation);
                            PrintAttributes.MediaSize orientedMedia = isLandscape
                                ? baseMedia.asLandscape()
                                : baseMedia.asPortrait();

                            int resolvedColorMode = "monochrome".equalsIgnoreCase(colorMode)
                                ? PrintAttributes.COLOR_MODE_MONOCHROME
                                : PrintAttributes.COLOR_MODE_COLOR;

                            PrintAttributes attributes = new PrintAttributes.Builder()
                                .setMediaSize(orientedMedia)
                                .setColorMode(resolvedColorMode)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();

                            printManager.print(jobName, printAdapter, attributes);
                            call.resolve();
                        } catch (Exception err) {
                            call.reject("Failed to open Android print dialog: " + err.getMessage(), err);
                        }
                    }
                });

                printWebView = webView;
                webView.loadDataWithBaseURL("about:blank", html, "text/html", "UTF-8", null);
            } catch (Exception err) {
                call.reject("Failed to prepare print WebView: " + err.getMessage(), err);
            }
        });
    }

    private static PrintAttributes.MediaSize resolveMediaSize(String paperSize) {
        if (paperSize == null) {
            return PrintAttributes.MediaSize.ISO_A4;
        }
        String normalized = paperSize.trim().toUpperCase(Locale.US);
        switch (normalized) {
            case "LETTER":
            case "NA_LETTER":
                return PrintAttributes.MediaSize.NA_LETTER;
            case "LEGAL":
            case "NA_LEGAL":
                return PrintAttributes.MediaSize.NA_LEGAL;
            case "A5":
            case "ISO_A5":
                return PrintAttributes.MediaSize.ISO_A5;
            case "A4":
            case "ISO_A4":
            default:
                return PrintAttributes.MediaSize.ISO_A4;
        }
    }
}
