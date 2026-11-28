package com.classgrid.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.print.PdfPrint;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Custom Capacitor Android print & Downloads/ClassGrid plugin:
 * - printHtml: Opens Android's native PrintManager with ISO A4, exact orientation, Color, and NO_MARGINS.
 * - savePdfToDownloads: Renders standalone HTML directly to a multi-page ISO A4 PDF inside Download/ClassGrid.
 * - saveFileToDownloads: Saves any exported file (JSON backup, Excel, PNG, ZIP, HTML) into Download/ClassGrid.
 */
@CapacitorPlugin(name = "NativePrint")
public class NativePrintPlugin extends Plugin {
    private static final String DEFAULT_FOLDER = "ClassGrid";

    // Keep a strong reference to the offscreen WebView until the next print/PDF job
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
                final WebView webView = createPrintWebView(activity);
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
                            PrintAttributes attributes = buildPrintAttributes(
                                orientation, paperSize, colorMode, false
                            );

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

    @PluginMethod
    public void savePdfToDownloads(PluginCall call) {
        final String html = call.getString("html");
        if (html == null || html.trim().isEmpty()) {
            call.reject("Missing HTML content to save as PDF.");
            return;
        }

        final String rawName = call.getString("name", "Document");
        final String orientation = call.getString("orientation", "portrait");
        final String paperSize = call.getString("paperSize", "A4");
        final String colorMode = call.getString("colorMode", "color");
        final String safeFolder = sanitizeFolderName(call.getString("folder", DEFAULT_FOLDER));
        final String pdfFileName = ensureExtension(sanitizeFileName(rawName, "Document"), ".pdf");

        final Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.reject("Android Activity is unavailable for saving PDF.");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                final WebView webView = createPrintWebView(activity);
                final AtomicBoolean renderTriggered = new AtomicBoolean(false);

                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        if (!renderTriggered.compareAndSet(false, true)) {
                            return;
                        }
                        try {
                            PrintDocumentAdapter printAdapter = view.createPrintDocumentAdapter(pdfFileName);
                            PrintAttributes attributes = buildPrintAttributes(
                                orientation, paperSize, colorMode, true
                            );
                            renderPdfToDownloadsFolder(
                                activity,
                                printAdapter,
                                attributes,
                                safeFolder,
                                pdfFileName,
                                call
                            );
                        } catch (Exception err) {
                            call.reject("Failed to generate PDF: " + err.getMessage(), err);
                        }
                    }
                });

                printWebView = webView;
                webView.loadDataWithBaseURL("about:blank", html, "text/html", "UTF-8", null);
            } catch (Exception err) {
                call.reject("Failed to prepare PDF WebView: " + err.getMessage(), err);
            }
        });
    }

    @PluginMethod
    public void saveFileToDownloads(PluginCall call) {
        final String base64Data = call.getString("data");
        final String rawFileName = call.getString("fileName");
        if (base64Data == null || base64Data.isEmpty() || rawFileName == null || rawFileName.trim().isEmpty()) {
            call.reject("Missing file data or fileName.");
            return;
        }

        final String mimeType = call.getString("mimeType", "application/octet-stream");
        final String safeFolder = sanitizeFolderName(call.getString("folder", DEFAULT_FOLDER));
        final String safeFileName = sanitizeFileName(rawFileName, "classgrid-file");

        final Context context = getContext();
        if (context == null) {
            call.reject("Android Context is unavailable.");
            return;
        }

        try {
            final byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = context.getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeFileName);
                values.put(
                    MediaStore.MediaColumns.MIME_TYPE,
                    (mimeType == null || mimeType.trim().isEmpty()) ? "application/octet-stream" : mimeType
                );
                values.put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + File.separator + safeFolder
                );
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    call.reject("Could not create file in Downloads/" + safeFolder + ".");
                    return;
                }

                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) {
                        resolver.delete(uri, null, null);
                        call.reject("Could not open output stream for Downloads/" + safeFolder + ".");
                        return;
                    }
                    out.write(bytes);
                    out.flush();
                } catch (Exception writeErr) {
                    resolver.delete(uri, null, null);
                    call.reject("Failed writing file: " + writeErr.getMessage(), writeErr);
                    return;
                }

                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(uri, done, null, null);

                String actualName = queryDisplayName(resolver, uri, safeFileName);
                JSObject result = new JSObject();
                result.put("fileName", actualName);
                result.put("path", "Download/" + safeFolder + "/" + actualName);
                result.put("uri", uri.toString());
                call.resolve(result);
            } else {
                File dir = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    safeFolder
                );
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("Could not create Download/" + safeFolder + " folder.");
                    return;
                }
                File outFile = uniqueFile(dir, safeFileName);
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    fos.write(bytes);
                    fos.flush();
                }
                MediaScannerConnection.scanFile(
                    context,
                    new String[]{outFile.getAbsolutePath()},
                    new String[]{mimeType},
                    null
                );

                JSObject result = new JSObject();
                result.put("fileName", outFile.getName());
                result.put("path", "Download/" + safeFolder + "/" + outFile.getName());
                result.put("uri", Uri.fromFile(outFile).toString());
                call.resolve(result);
            }
        } catch (Exception err) {
            call.reject("Failed to save file to Download/" + safeFolder + ": " + err.getMessage(), err);
        }
    }

    private void renderPdfToDownloadsFolder(
        final Activity activity,
        final PrintDocumentAdapter printAdapter,
        final PrintAttributes attributes,
        final String safeFolder,
        final String pdfFileName,
        final PluginCall call
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            final ContentResolver resolver = activity.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, pdfFileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
            values.put(
                MediaStore.MediaColumns.RELATIVE_PATH,
                Environment.DIRECTORY_DOWNLOADS + File.separator + safeFolder
            );
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            final Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                call.reject("Could not create PDF in Download/" + safeFolder + ".");
                return;
            }

            final ParcelFileDescriptor pfd;
            try {
                pfd = resolver.openFileDescriptor(uri, "w");
            } catch (Exception err) {
                resolver.delete(uri, null, null);
                call.reject("Could not open PDF destination: " + err.getMessage(), err);
                return;
            }

            if (pfd == null) {
                resolver.delete(uri, null, null);
                call.reject("Could not open PDF file descriptor.");
                return;
            }

            new PdfPrint(attributes).print(printAdapter, pfd, new PdfPrint.Callback() {
                @Override
                public void onSuccess() {
                    try {
                        ContentValues done = new ContentValues();
                        done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                        resolver.update(uri, done, null, null);

                        String actualName = queryDisplayName(resolver, uri, pdfFileName);
                        JSObject result = new JSObject();
                        result.put("fileName", actualName);
                        result.put("path", "Download/" + safeFolder + "/" + actualName);
                        result.put("uri", uri.toString());
                        call.resolve(result);
                    } catch (Exception err) {
                        call.reject("PDF saved but could not be finalized: " + err.getMessage(), err);
                    }
                }

                @Override
                public void onFailure(String error) {
                    try {
                        resolver.delete(uri, null, null);
                    } catch (Exception ignored) {
                    }
                    call.reject(error != null ? error : "Could not generate PDF.");
                }
            });
        } else {
            File dir = new File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                safeFolder
            );
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("Could not create Download/" + safeFolder + " folder.");
                return;
            }

            final File outFile = uniqueFile(dir, pdfFileName);
            final ParcelFileDescriptor pfd;
            try {
                pfd = ParcelFileDescriptor.open(
                    outFile,
                    ParcelFileDescriptor.MODE_CREATE
                        | ParcelFileDescriptor.MODE_READ_WRITE
                        | ParcelFileDescriptor.MODE_TRUNCATE
                );
            } catch (Exception err) {
                call.reject("Could not open PDF file: " + err.getMessage(), err);
                return;
            }

            new PdfPrint(attributes).print(printAdapter, pfd, new PdfPrint.Callback() {
                @Override
                public void onSuccess() {
                    MediaScannerConnection.scanFile(
                        activity,
                        new String[]{outFile.getAbsolutePath()},
                        new String[]{"application/pdf"},
                        null
                    );
                    JSObject result = new JSObject();
                    result.put("fileName", outFile.getName());
                    result.put("path", "Download/" + safeFolder + "/" + outFile.getName());
                    result.put("uri", Uri.fromFile(outFile).toString());
                    call.resolve(result);
                }

                @Override
                public void onFailure(String error) {
                    try {
                        if (outFile.exists()) outFile.delete();
                    } catch (Exception ignored) {
                    }
                    call.reject(error != null ? error : "Could not generate PDF.");
                }
            });
        }
    }

    private static WebView createPrintWebView(Activity activity) {
        final WebView webView = new WebView(activity);
        final WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setBlockNetworkImage(false);
        return webView;
    }

    private static PrintAttributes buildPrintAttributes(
        String orientation,
        String paperSize,
        String colorMode,
        boolean includeResolution
    ) {
        PrintAttributes.MediaSize baseMedia = resolveMediaSize(paperSize);
        boolean isLandscape = "landscape".equalsIgnoreCase(orientation);
        PrintAttributes.MediaSize orientedMedia = isLandscape
            ? baseMedia.asLandscape()
            : baseMedia.asPortrait();

        int resolvedColorMode = "monochrome".equalsIgnoreCase(colorMode)
            ? PrintAttributes.COLOR_MODE_MONOCHROME
            : PrintAttributes.COLOR_MODE_COLOR;

        PrintAttributes.Builder builder = new PrintAttributes.Builder()
            .setMediaSize(orientedMedia)
            .setColorMode(resolvedColorMode)
            .setMinMargins(PrintAttributes.Margins.NO_MARGINS);

        if (includeResolution) {
            builder.setResolution(new PrintAttributes.Resolution("classgrid_pdf", "PDF", 300, 300));
        }

        return builder.build();
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

    private static String sanitizeFolderName(String folder) {
        if (folder == null) return DEFAULT_FOLDER;
        String cleaned = folder.replaceAll("[^A-Za-z0-9 _-]+", "").trim();
        return cleaned.isEmpty() ? DEFAULT_FOLDER : cleaned;
    }

    private static String sanitizeFileName(String name, String fallback) {
        if (name == null) return fallback;
        String cleaned = name
            .replaceAll("[\\\\/:*?\"<>|]+", " ")
            .replaceAll("\\s+", " ")
            .trim();
        if (cleaned.length() > 100) {
            cleaned = cleaned.substring(0, 100).trim();
        }
        return cleaned.isEmpty() ? fallback : cleaned;
    }

    private static String ensureExtension(String fileName, String ext) {
        if (fileName.toLowerCase(Locale.US).endsWith(ext.toLowerCase(Locale.US))) {
            return fileName;
        }
        return fileName + ext;
    }

    private static File uniqueFile(File dir, String fileName) {
        File candidate = new File(dir, fileName);
        if (!candidate.exists()) return candidate;

        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String ext = dot > 0 ? fileName.substring(dot) : "";
        for (int i = 2; i < 1000; i++) {
            File next = new File(dir, base + " (" + i + ")" + ext);
            if (!next.exists()) return next;
        }
        return new File(dir, base + "-" + System.currentTimeMillis() + ext);
    }

    private static String queryDisplayName(ContentResolver resolver, Uri uri, String fallback) {
        try (Cursor cursor = resolver.query(
            uri,
            new String[]{MediaStore.MediaColumns.DISPLAY_NAME},
            null,
            null,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String found = cursor.getString(idx);
                    if (found != null && !found.trim().isEmpty()) {
                        return found.trim();
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return fallback;
    }
}
