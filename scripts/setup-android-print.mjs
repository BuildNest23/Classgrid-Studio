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

function readRequiredTemplate(fileName) {
  const templatePath = path.join(rootDir, 'android-res', fileName);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`[setup-android-print] Missing template file: android-res/${fileName}`);
  }
  return fs.readFileSync(templatePath, 'utf8');
}

function buildPluginSource(packageName) {
  const raw = readRequiredTemplate('NativePrintPlugin.java');
  return raw.replace(/^package\s+[^;]+;/m, `package ${packageName};`);
}

function buildPdfPrintSource() {
  return readRequiredTemplate('PdfPrint.java');
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
  const javaRoot = path.join(androidDir, 'app', 'src', 'main', 'java');
  const packagePath = appId.split('.').join(path.sep);
  const javaPkgDir = path.join(javaRoot, packagePath);
  const androidPrintDir = path.join(javaRoot, 'android', 'print');

  fs.mkdirSync(javaPkgDir, { recursive: true });
  fs.mkdirSync(androidPrintDir, { recursive: true });

  const pdfPrintPath = path.join(androidPrintDir, 'PdfPrint.java');
  fs.writeFileSync(pdfPrintPath, buildPdfPrintSource(), 'utf8');
  console.log(`[setup-android-print] Wrote ${path.relative(rootDir, pdfPrintPath)}`);

  const pluginPath = path.join(javaPkgDir, 'NativePrintPlugin.java');
  fs.writeFileSync(pluginPath, buildPluginSource(appId), 'utf8');
  console.log(`[setup-android-print] Wrote ${path.relative(rootDir, pluginPath)}`);

  const mainActivityPath = path.join(javaPkgDir, 'MainActivity.java');
  patchMainActivity(mainActivityPath, appId);
}

main();
