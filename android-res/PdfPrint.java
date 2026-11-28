package android.print;

import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;

import java.io.IOException;

/**
 * Helper placed in the android.print package so PrintDocumentAdapter's package-private
 * LayoutResultCallback and WriteResultCallback can be invoked cleanly without reflection,
 * letting WebView stream a full multi-page PDF directly to a ParcelFileDescriptor.
 */
public class PdfPrint {
    public interface Callback {
        void onSuccess();
        void onFailure(String error);
    }

    private final PrintAttributes printAttributes;

    public PdfPrint(PrintAttributes printAttributes) {
        this.printAttributes = printAttributes;
    }

    public void print(
        final PrintDocumentAdapter printAdapter,
        final ParcelFileDescriptor output,
        final Callback callback
    ) {
        if (printAdapter == null || output == null) {
            closeQuietly(output);
            if (callback != null) {
                callback.onFailure("Print adapter or destination file descriptor is null.");
            }
            return;
        }

        try {
            printAdapter.onStart();
            printAdapter.onLayout(
                null,
                printAttributes,
                new CancellationSignal(),
                new PrintDocumentAdapter.LayoutResultCallback() {
                    @Override
                    public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                        try {
                            printAdapter.onWrite(
                                new PageRange[]{PageRange.ALL_PAGES},
                                output,
                                new CancellationSignal(),
                                new PrintDocumentAdapter.WriteResultCallback() {
                                    @Override
                                    public void onWriteFinished(PageRange[] pages) {
                                        finishQuietly(printAdapter);
                                        closeQuietly(output);
                                        if (callback != null) {
                                            callback.onSuccess();
                                        }
                                    }

                                    @Override
                                    public void onWriteFailed(CharSequence error) {
                                        finishQuietly(printAdapter);
                                        closeQuietly(output);
                                        if (callback != null) {
                                            callback.onFailure(
                                                error != null ? error.toString() : "PDF write failed."
                                            );
                                        }
                                    }

                                    @Override
                                    public void onWriteCancelled() {
                                        finishQuietly(printAdapter);
                                        closeQuietly(output);
                                        if (callback != null) {
                                            callback.onFailure("PDF write was cancelled.");
                                        }
                                    }
                                }
                            );
                        } catch (Exception err) {
                            finishQuietly(printAdapter);
                            closeQuietly(output);
                            if (callback != null) {
                                callback.onFailure("PDF write error: " + err.getMessage());
                            }
                        }
                    }

                    @Override
                    public void onLayoutFailed(CharSequence error) {
                        finishQuietly(printAdapter);
                        closeQuietly(output);
                        if (callback != null) {
                            callback.onFailure(
                                error != null ? error.toString() : "PDF layout failed."
                            );
                        }
                    }

                    @Override
                    public void onLayoutCancelled() {
                        finishQuietly(printAdapter);
                        closeQuietly(output);
                        if (callback != null) {
                            callback.onFailure("PDF layout was cancelled.");
                        }
                    }
                },
                null
            );
        } catch (Exception err) {
            finishQuietly(printAdapter);
            closeQuietly(output);
            if (callback != null) {
                callback.onFailure("PDF layout error: " + err.getMessage());
            }
        }
    }

    private static void finishQuietly(PrintDocumentAdapter adapter) {
        try {
            adapter.onFinish();
        } catch (Exception ignored) {
        }
    }

    private static void closeQuietly(ParcelFileDescriptor pfd) {
        if (pfd == null) return;
        try {
            pfd.close();
        } catch (IOException ignored) {
        }
    }
}
