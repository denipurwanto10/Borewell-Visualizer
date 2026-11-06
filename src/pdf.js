// Generator PDF laporan sumur bor.
//
// Tata letak dibangun di atas "pdf-kit" (src/pdf-kit):
//   kit.js       — mesin layout: alur halaman, header/footer, tabel, kartu, foto
//   diagrams.js  — diagram konstruksi sumur, kolom litologi, hidrograf
//   sections.js  — bagian-bagian laporan (sampul, daftar isi, konstruksi, dst.)
//
// Dua mode (API publik tidak berubah):
//   - tanpa _reportConfig : "Laporan Konstruksi Sumur Bor" (tombol Unduh PDF)
//   - dengan _reportConfig: "Laporan Penyelesaian Sumur" (halaman Laporan PDF)

import { Doc, prepareImage } from './pdf-kit/kit.js';
import {
  buildContext, renderCover, renderToc,
  sectionInfo, sectionConstruction, sectionGeology, sectionMonitoring,
  sectionBoreholeCamera, sectionActivityDocs, sectionFieldDocs, sectionNotes,
  activityImageList,
} from './pdf-kit/sections.js';
import { fmtDate } from './pdf-kit/kit.js';
import { getPhotoCategoryLabel } from './documentation/model.js';

const safeName = (s) => String(s || '').trim().replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');

/**
 * Susun dokumen PDF. Mengembalikan { pdf, fileName } tanpa menyimpan,
 * sehingga bisa dipakai untuk pratinjau atau pengujian.
 *
 * photoRecords (opsional, mode laporan): [{ id, name, category, description, documentedAt, dataUrl }]
 */
export async function buildBoreholePdf({ model, well, activity, project, designer, geology, monitoring, _reportConfig }) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  const report = !!_reportConfig;
  const cfg = _reportConfig || {};
  const sections = cfg.sections || {};
  const metadata = cfg.metadata || {};
  const notes = cfg.notes || {};

  const c = buildContext({ model: model || {}, well, project, designer, geology, monitoring });
  const boreholeImages = well?.boreholeImages || {};

  const wellLabel = [c.well.wellCode, c.well.wellName].filter(Boolean).join('  |  ') || c.project.projectName || '';
  const docTitle = report ? (metadata.title || 'Laporan Penyelesaian Sumur Bor') : 'Laporan Konstruksi Sumur Bor';
  const printed = fmtDate(new Date());
  const footerLeft = report
    ? [metadata.reportNumber && `No. ${metadata.reportNumber}`, (metadata.revision !== undefined && metadata.revision !== '') && `Rev. ${metadata.revision}`, c.project.projectName].filter(Boolean).join('  |  ')
    : [c.project.projectName, `Dicetak ${printed}`].filter(Boolean).join('  |  ');

  const doc = new Doc(pdf, { headerTitle: docTitle, headerRight: wellLabel, footerLeft });

  pdf.setProperties({
    title: docTitle,
    subject: `Sumur ${c.well.wellName || c.well.wellCode || ''}`.trim(),
    author: metadata.preparedBy || c.well.companyName || '',
    creator: 'Visualisasi Pipa',
  });

  // ---- muat & kompres gambar sekali di awal ----
  const photoRecords = (cfg.photoRecords || []).filter((p) => p && p.dataUrl);
  const wanted = new Set(cfg.selectedPhotoIds || []);
  const chosenPhotos = report
    ? (wanted.size ? photoRecords.filter((p) => wanted.has(p.id)) : [])
    : [];
  const imageSources = [
    ...Object.values(boreholeImages),
    ...activityImageList(activity),
    ...chosenPhotos.map((p) => p.dataUrl),
  ];
  await doc.loadImages(imageSources, { maxPx: 1500, quality: 0.8 });
  if (report && metadata.logoDataUrl) {
    doc.images.set(metadata.logoDataUrl, await prepareImage(metadata.logoDataUrl, { maxPx: 600, format: 'PNG' }));
  }

  // ---- susun halaman ----
  let tocPage = null;
  if (report) {
    if (sections.cover) {
      renderCover(doc, c, metadata);
      doc.newPage(); // halaman daftar isi (diisi di akhir)
      tocPage = doc.pageNo;
      doc.fresh = false;
    }
    if (sections.project_well_info) sectionInfo(doc, c);
    if (sections.well_construction) sectionConstruction(doc, c, { boreholeImages });
    if (sections.geological_log) sectionGeology(doc, c);
    if (sections.groundwater_monitoring) sectionMonitoring(doc, c);
    if (sections.field_documentation && (cfg.selectedPhotoIds || []).length) {
      sectionFieldDocs(doc, chosenPhotos, getPhotoCategoryLabel, (cfg.selectedPhotoIds || []).length);
    }
    if (sections.notes_conclusion) sectionNotes(doc, { notes, metadata });
  } else {
    sectionConstruction(doc, c, { compact: true, boreholeImages, showStats: false });
    sectionGeology(doc, c);
    sectionMonitoring(doc, c);
    sectionBoreholeCamera(doc, c, { boreholeImages });
    sectionActivityDocs(doc, activity);
  }

  if (tocPage !== null) {
    if (doc.toc.length) renderToc(doc, tocPage);
    else { /* tidak ada bagian lain: hapus halaman daftar isi kosong */ pdf.deletePage(tocPage); }
  }
  doc.finalize();

  const date = new Date().toISOString().split('T')[0];
  const code = safeName(c.well.wellCode);
  const fileName = report
    ? `laporan_penyelesaian_${code || 'sumur'}_${date}.pdf`
    : `laporan_konstruksi_sumur_bor${code ? `_${code}` : ''}_${date}.pdf`;
  return { pdf, fileName };
}

export async function downloadBoreholePdf(params) {
  const { pdf, fileName } = await buildBoreholePdf(params);
  pdf.save(fileName);
}
