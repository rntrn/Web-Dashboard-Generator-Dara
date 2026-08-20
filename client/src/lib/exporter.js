/**
 * Exporter — unduh area dashboard sebagai gambar / cetak PDF.
 * html2canvas di-import lazy supaya tak membebani load awal.
 */
import { ui } from "./uiBus";

/** Unduh sebuah elemen DOM (mis. area dashboard) sebagai PNG. */
export async function exportNodeToPng(node, filename = "dashboard.png") {
  if (!node) return;
  ui.startLoading();
  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(node, {
      backgroundColor: getComputedStyle(node).backgroundColor || "#ffffff",
      scale: 2,          // 2x untuk hasil tajam
      useCORS: true,
      logging: false,
    });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
    a.click();
    ui.toast("Gambar diunduh.", { kind: "success" });
  } catch (e) {
    ui.reportError("Gagal membuat gambar.", e);
  } finally {
    ui.stopLoading();
  }
}

/**
 * Cetak / simpan sebagai PDF via dialog print browser.
 * Print CSS (index.css) menyembunyikan sidebar & kontrol saat mencetak.
 */
export function printForPdf() {
  window.print();
}
