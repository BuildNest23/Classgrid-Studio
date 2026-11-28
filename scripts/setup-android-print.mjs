#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function readAppId() {
  const configPath = path.join(rootDir, 'capacitor.config.ts');
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/appId\s*:\s*['"]([^'"]+)['"]/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return 'com.classgrid.app';
}

function buildPluginSource(packageName) {
  const templatePath = path.join(rootDir, 'android-res', 'NativePrintPlugin.java');
  if (fs.existsSync(templatePath)) {
    const raw = fs.readFileSync(templatePath, 'utf8');
    return raw.replace(/^package\s+[^;]+;/m, `package ${packageName};`);
  }

  return `package ${packageName};

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

@CapacitorPlugin(name = "NativePrint")
public class NativePrintPlugin extends Plugin {
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
`;
}

function patchMainActivity(mainActivityPath, packageName) {
  if (!fs.existsSync(mainActivityPath)) {
    const freshMainActivity = `package ${packageName};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
    fs.writeFileSync(mainActivityPath, freshMainActivity, 'utf8');
    console.log(`[setup-android-print] Created ${path.relative(rootDir, mainActivityPath)}`);
    return;
  }

  let content = fs.readFileSync(mainActivityPath, 'utf8');

  if (content.includes('registerPlugin(NativePrintPlugin.class)')) {
    console.log(`[setup-android-print] MainActivity already registers NativePrintPlugin.`);
    return;
  }

  const superOnCreateRe = /^([ \t]*)super\.onCreate\(savedInstanceState\);/m;
  if (superOnCreateRe.test(content)) {
    content = content.replace(
      superOnCreateRe,
      '$1registerPlugin(NativePrintPlugin.class);\n$1super.onCreate(savedInstanceState);'
    );
  } else {
    // Capacitor's bare default MainActivity has an empty class body
    if (!content.includes('import android.os.Bundle;')) {
      content = content.replace(
        /(import\s+com\.getcapacitor\.BridgeActivity;)/,
        'import android.os.Bundle;\n$1'
      );
    }
    content = content.replace(
      /public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{[\s\S]*?\}/,
      `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}`
    );
  }

  fs.writeFileSync(mainActivityPath, content, 'utf8');
  console.log(`[setup-android-print] Patched ${path.relative(rootDir, mainActivityPath)}`);
}

function main() {
  const androidDir = path.join(rootDir, 'android');
  if (!fs.existsSync(androidDir)) {
    console.log('[setup-android-print] android/ directory not found. Run "npx cap add android" first.');
    return;
  }

  const appId = readAppId();
  const packagePath = appId.split('.').join(path.sep);
  const javaPkgDir = path.join(androidDir, 'app', 'src', 'main', 'java', packagePath);

  fs.mkdirSync(javaPkgDir, { recursive: true });

  const pluginPath = path.join(javaPkgDir, 'NativePrintPlugin.java');
  fs.writeFileSync(pluginPath, buildPluginSource(appId), 'utf8');
  console.log(`[setup-android-print] Wrote ${path.relative(rootDir, pluginPath)}`);

  const mainActivityPath = path.join(javaPkgDir, 'MainActivity.java');
  patchMainActivity(mainActivityPath, appId);
}

main();
