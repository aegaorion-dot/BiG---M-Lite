// BiG-M Jurisdiction Layer v19
// -----------------------------------------------------------------------------
// Shared policy/configuration layer for international tax controversy.
// This is NOT a tax-law database. It defines jurisdiction-specific roles,
// terminology, authority hierarchy, official-source domains and research rules.
// Current law must still be verified against the cited primary source and tax year.

export type JurisdictionCode = "ID" | "SG" | "US" | "AU" | "GB";

export type JurisdictionConfig = {
  code: JurisdictionCode;
  name: string;
  flag: string;
  authorityName: string;
  currencyCode: string;
  locale: string;
  authorityRole: string;
  taxpayerRole: string;
  courtSystem: string[];
  authorityHierarchy: string[];
  officialDomains: string[];
  legalTerminology: string[];
  controversyStages: string[];
  proceduralControls?: string[];
  researchInstruction: string;
  disclaimer: string;
  // Deterministic screening deadline for the primary objection stage. This is
  // NOT decided by the AI — hardcoding it means a deadline calculation cannot be
  // hallucinated or silently skipped because search grounding failed at runtime.
  // null = too jurisdiction/case-specific for a fixed screening rule; the AI must
  // say the deadline requires manual verification rather than guessing.
  objectionWindowMonths: number | null;
  objectionWindowNote: string;
  objectionWindowReference: string;
};

export const JURISDICTIONS: Record<JurisdictionCode, JurisdictionConfig> = {
  ID: {
    code: "ID", name: "Indonesia", flag: "🇮🇩", authorityName: "DJP / Direktorat Jenderal Pajak", currencyCode: "IDR", locale: "id-ID",
    authorityRole: "Fiskus / pemeriksa pajak",
    taxpayerRole: "Wajib Pajak / Kuasa Pajak",
    courtSystem: ["Keberatan", "Pengadilan Pajak", "Mahkamah Agung"],
    authorityHierarchy: ["UU/Perppu", "PP", "PMK", "PER DJP", "SE DJP (guidance, not legislation)", "Putusan Pengadilan Pajak", "Putusan Mahkamah Agung"],
    officialDomains: ["pajak.go.id", "peraturan.bpk.go.id", "jdih.kemenkeu.go.id", "peraturan.go.id", "mahkamahagung.go.id", "setpp.kemenkeu.go.id", "coretaxdjp.pajak.go.id"],
    legalTerminology: ["Wajib Pajak", "Fiskus", "SPHP", "Pembahasan Akhir", "Keberatan", "Banding", "P3B", "Coretax DJP", "Bukti Potong Unifikasi"],
    controversyStages: ["Pemeriksaan", "SPHP", "Pembahasan Akhir", "Quality Assurance", "Keberatan", "Banding/Gugatan", "Peninjauan Kembali"],
    researchInstruction: "Prioritaskan sumber resmi Indonesia dan bedakan aturan yang berlaku pada tahun pajak sengketa dari aturan saat ini. Administrasi DJP (e-Faktur, e-Bupot, SPT) bermigrasi ke sistem Coretax DJP — saat menyebut proses administratif, cek apakah istilah/alur kini berjalan lewat Coretax alih-alih sistem lama, dan jangan asumsikan istilah pra-Coretax masih berlaku tanpa verifikasi.",
    disclaimer: "Analisis bukan pendapat hukum atau putusan; verifikasi aturan, keberlakuan tahun pajak, dan putusan lengkap sebelum digunakan.",
    objectionWindowMonths: 3,
    objectionWindowNote: "Keberatan umumnya wajib diajukan dalam 3 bulan sejak tanggal surat ketetapan pajak dikirim (kecuali force majeure yang dapat dibuktikan).",
    objectionWindowReference: "UU KUP Pasal 25 ayat (3) — verifikasi ulang edisi/perubahan terbaru sebelum diandalkan.",
  },
  SG: {
    code: "SG", name: "Singapore", flag: "🇸🇬", authorityName: "IRAS / Inland Revenue Authority of Singapore", currencyCode: "SGD", locale: "en-SG",
    authorityRole: "IRAS / tax authority and audit officer",
    taxpayerRole: "Taxpayer / tax representative",
    courtSystem: ["Objection/Review with IRAS", "Board of Review", "High Court", "Court of Appeal"],
    authorityHierarchy: ["Acts of Parliament", "Subsidiary legislation", "Treaty provisions as implemented/applicable", "IRAS e-Tax Guides / practice guidance", "Income Tax Board of Review decisions", "High Court / Appellate Division / Court of Appeal decisions"],
    officialDomains: ["iras.gov.sg", "sso.agc.gov.sg", "mof.gov.sg", "judiciary.gov.sg"],
    legalTerminology: ["IRAS", "Comptroller of Income Tax (CIT)", "Notice of Assessment (NOA)", "Notice of Objection", "Review", "Notice of Refusal to Amend", "Income Tax Board of Review (ITBR)", "General Division of the High Court", "Appellate Division", "Court of Appeal", "DTA"],
    controversyStages: ["Audit / information review", "Notice of Assessment", "Objection", "IRAS Review", "Notice of Refusal to Amend", "Income Tax Board of Review", "High Court / further appeal"],
    proceduralControls: ["CIT objection generally within 2 months of service of NOA", "Precise grounds: YA + disputed item + amount + reason", "Taxpayer generally replies to IRAS queries within 2 months", "CIT generally decides within 6 months from last complete correspondence; complex cases may take longer", "ITBR appeal generally within 30 days of Notice of Refusal to Amend", "Further appeal route depends on question of law / mixed law and fact and statutory thresholds"],
    researchInstruction: "Use Singapore primary legislation and current IRAS guidance. Treat IRAS guidance as administrative guidance unless the source states it has legal force. Verify the exact YA, service date, amendment scope, objection validity, finality, appeal deadline, and binding weight of every authority. Never assume an Indonesian-style objection/audit process applies in Singapore.",
    disclaimer: "Not Singapore legal or tax advice; verify the relevant Act, subsidiary legislation, IRAS guidance and tax-year applicability.",
    objectionWindowMonths: 2,
    objectionWindowNote: "Notice of Objection is generally required within 2 months from the date of service of the Notice of Assessment; late objections need a valid reason accepted by IRAS.",
    objectionWindowReference: "IRAS e-Tax Guide — Corporate Income Tax: Objection and Appeal Process (verify current edition/date before relying on this).",
  },
  US: {
    code: "US", name: "United States", flag: "🇺🇸", authorityName: "IRS / Internal Revenue Service", currencyCode: "USD", locale: "en-US",
    authorityRole: "IRS examiner / Appeals officer",
    taxpayerRole: "Taxpayer / tax counsel / representative",
    courtSystem: ["IRS Examination", "IRS Independent Office of Appeals", "U.S. Tax Court", "Federal District Court / Court of Federal Claims", "Courts of Appeals", "Supreme Court"],
    authorityHierarchy: ["Internal Revenue Code", "Treasury Regulations", "Revenue Rulings/Procedures", "IRS guidance", "Tax Court / federal court decisions", "Treaties"],
    officialDomains: ["irs.gov", "uscode.house.gov", "ecfr.gov", "congress.gov", "ustaxcourt.gov", "uscourts.gov"],
    legalTerminology: ["IRS", "Notice of Deficiency", "Examination", "Appeals", "Tax Court", "Revenue Ruling", "Revenue Procedure"],
    controversyStages: ["Examination", "30-day letter/Appeals", "Notice of Deficiency", "Tax Court or refund litigation", "Appeal"],
    researchInstruction: "Use the Internal Revenue Code and Treasury Regulations as primary authorities. Clearly label IRS administrative guidance versus binding law and check the tax year.",
    disclaimer: "Not U.S. legal or tax advice; verify the Code, Regulations, official IRS guidance and controlling case law for the relevant tax year.",
    objectionWindowMonths: null,
    objectionWindowNote: "U.S. deadlines vary materially by stage (e.g. 90-day/150-day Notice of Deficiency petition window to Tax Court, separate Appeals/CDP deadlines) — too case-specific for a single fixed rule.",
    objectionWindowReference: "Verify the applicable deadline directly from the specific notice received and IRC §6213 / current IRS guidance.",
  },
  AU: {
    code: "AU", name: "Australia", flag: "🇦🇺", authorityName: "ATO / Australian Taxation Office", currencyCode: "AUD", locale: "en-AU",
    authorityRole: "ATO auditor / tax officer",
    taxpayerRole: "Taxpayer / tax agent / tax lawyer",
    courtSystem: ["ATO review/objection", "Administrative Review Tribunal", "Federal Court", "Full Federal Court", "High Court"],
    authorityHierarchy: ["Commonwealth Acts", "Regulations", "ATO public rulings/guidance", "Administrative Review Tribunal decisions", "Federal/High Court decisions", "Treaties"],
    officialDomains: ["ato.gov.au", "legislation.gov.au", "art.gov.au", "fedcourt.gov.au", "hcourt.gov.au"],
    legalTerminology: ["ATO", "Objection", "Private Ruling", "Public Ruling", "Administrative Review Tribunal", "Federal Court"],
    controversyStages: ["ATO audit/review", "Objection", "Administrative Review Tribunal", "Federal Court", "Appeal"],
    researchInstruction: "Prioritize Commonwealth legislation and official ATO rulings. Treat ATO guidance according to its legal status and verify the relevant income year.",
    disclaimer: "Not Australian legal or tax advice; verify legislation, ATO rulings and applicable tribunal/court authority for the relevant income year.",
    objectionWindowMonths: null,
    objectionWindowNote: "Australian objection deadlines depend on assessment type and can be affected by amendment periods — too case-specific for a single fixed rule.",
    objectionWindowReference: "Verify the applicable deadline directly from the notice of assessment and current ATO guidance (Taxation Administration Act 1953, Part IVC).",
  },
  GB: {
    code: "GB", name: "United Kingdom", flag: "🇬🇧", authorityName: "HMRC / His Majesty's Revenue and Customs", currencyCode: "GBP", locale: "en-GB",
    authorityRole: "HMRC compliance officer / caseworker",
    taxpayerRole: "Taxpayer / tax adviser / tax solicitor",
    courtSystem: ["HMRC review", "First-tier Tribunal (Tax)", "Upper Tribunal", "Court of Appeal", "Supreme Court"],
    authorityHierarchy: ["Acts of Parliament", "Statutory instruments", "HMRC manuals/guidance", "First-tier/Upper Tribunal decisions", "Higher court decisions", "Treaties"],
    officialDomains: ["gov.uk", "legislation.gov.uk", "judiciary.uk", "supremecourt.uk"],
    legalTerminology: ["HMRC", "Enquiry", "Closure Notice", "Statutory Review", "First-tier Tribunal", "Upper Tribunal", "DOTAS", "DTA"],
    controversyStages: ["HMRC enquiry", "Statutory review", "First-tier Tribunal", "Upper Tribunal", "Higher appeal"],
    researchInstruction: "Use UK legislation as primary law and clearly distinguish HMRC manuals/guidance from legislation and binding precedent. Check the tax year and commencement provisions.",
    disclaimer: "Not UK legal or tax advice; verify legislation, commencement provisions, HMRC guidance and applicable tribunal/court authority.",
    objectionWindowMonths: null,
    objectionWindowNote: "UK appeal deadlines (commonly 30 days to appeal a decision, subject to review request timing) vary by notice type — too case-specific for a single fixed rule.",
    objectionWindowReference: "Verify the applicable deadline directly from the specific HMRC decision notice and current HMRC guidance.",
  },
};

export const SUPPORTED_JURISDICTIONS = Object.values(JURISDICTIONS);

export function getJurisdiction(code?: string): JurisdictionConfig {
  const normalized = String(code || "ID").toUpperCase() as JurisdictionCode;
  return JURISDICTIONS[normalized] || JURISDICTIONS.ID;
}

export function jurisdictionPrompt(code?: string, language: "id" | "en" = "id"): string {
  const j = getJurisdiction(code);
  const lang = language === "en" ? "English" : "Bahasa Indonesia";
  return `JURISDICTION CONTROL:\n- Jurisdiction: ${j.name} (${j.code})\n- Tax authority / adversary: ${j.authorityName}\n- Tax authority role: ${j.authorityRole}\n- Taxpayer role: ${j.taxpayerRole}\n- Currency: ${j.currencyCode}\n- Authority hierarchy: ${j.authorityHierarchy.join(" > ")}\n- Controversy stages: ${j.controversyStages.join(" > ")}\n- Official research domains: ${j.officialDomains.join(", ")}\n- Local terminology: ${j.legalTerminology.join(", ")}\n- Research rule: ${j.researchInstruction}\n- Output language: ${lang}\n- IMPORTANT: Do not import Indonesian concepts, deadlines, procedures, tax rates or legal citations into another jurisdiction unless the user explicitly asks for a cross-border comparison.\n- IMPORTANT: Treaty analysis requires both jurisdictions and the treaty in force for the relevant period.`;
}
