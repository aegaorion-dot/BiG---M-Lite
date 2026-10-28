# Observed official-source access matrix

Generated offline from observations.jsonl; each request has a timestamp, status/error and raw hash when captured. See access-matrix.json for full request evidence and sample-manifest.json for document structures.

| Source | Role | Successful observed formats | Working structured requests | Other observations |
|---|---|---|---|---|
| ID-DJP | TAX_AUTHORITY | UNSUPPORTED, HTML | Not verified | 404 |
| ID-BPK | PRIMARY_LEGISLATION | HTML, UNSUPPORTED, XML | sitemap.xml (XML) | No failure in tested requests |
| ID-JDIH | SECONDARY_LEGISLATION | HTML, UNSUPPORTED, XML, JSON | sitemap.xml (XML), json-feed (JSON), rss (XML), rss (XML), json-feed (JSON), rss (XML), json-feed (JSON) | 404 |
| ID-DJPP | OFFICIAL_GAZETTE | HTML, UNSUPPORTED, PDF | Not verified | fetch failed |
| ID-CORETAX | TAX_AUTHORITY | HTML, UNSUPPORTED | Not verified | 404 |
| ID-MA | COURT | UNSUPPORTED | Not verified | 403 |
| ID-SETPP | TRIBUNAL | HTML | Not verified | 404 |
| SG-IRAS | TAX_AUTHORITY | HTML, PDF | Not verified | 404 |
| SG-SSO | PRIMARY_LEGISLATION | None | Not verified | 403 |
| SG-MOF | FINANCE_MINISTRY | UNSUPPORTED, HTML, XML | sitemap.xml (XML) | No failure in tested requests |
| SG-JUDICIARY | COURT | UNSUPPORTED, HTML | Not verified | No failure in tested requests |
| US-IRS | TAX_AUTHORITY | UNSUPPORTED, HTML, XML | sitemap.xml (XML) | No failure in tested requests |
| US-USCODE | PRIMARY_LEGISLATION | HTML, UNSUPPORTED | Not verified | 404 |
| US-ECFR | SECONDARY_LEGISLATION | UNSUPPORTED, JSON, XML | api-titles (JSON), api-titles (JSON), api-titles (JSON), api-titles (JSON), legislation-regulation (XML) | Redirect blocked: UNREGISTERED_OFFICIAL_SOURCE_CANDIDATE; 404 |
| US-CONGRESS | PRIMARY_LEGISLATION | UNSUPPORTED | Not verified | 403 |
| US-TAXCOURT | COURT | UNSUPPORTED, HTML, XML | sitemap.xml (XML) | No failure in tested requests |
| US-COURTS | COURT | UNSUPPORTED, HTML, XML | sitemap.xml (XML) | No failure in tested requests |
| AU-ATO | TAX_AUTHORITY | UNSUPPORTED, HTML, PDF | Not verified | Document exceeds byte limit; 403 |
| AU-FRL | PRIMARY_LEGISLATION | HTML, UNSUPPORTED, XML, JSON | sitemap.xml (XML), api-docs (JSON) | Document exceeds byte limit; The operation was aborted due to timeout |
| AU-TREASURY | FINANCE_MINISTRY | HTML, XML, UNSUPPORTED | sitemap.xml (XML) | No failure in tested requests |
| AU-ART | TRIBUNAL | HTML, UNSUPPORTED, XML | sitemap.xml (XML) | No failure in tested requests |
| AU-FEDCOURT | COURT | UNSUPPORTED | Not verified | 403; 404 |
| AU-HCOURT | COURT | HTML, UNSUPPORTED, XML | sitemap.xml (XML) | No failure in tested requests |
| GB-GOVUK | OFFICIAL_GUIDANCE | HTML, UNSUPPORTED, XML, JSON | sitemap.xml (XML), tax-page (JSON), guidance (JSON), tax-page (JSON), guidance (JSON) | No failure in tested requests |
| GB-LEGISLATION | PRIMARY_LEGISLATION | UNSUPPORTED, HTML, XML | feed (XML), legislation (XML), legislation (XML), feed (XML) | No failure in tested requests |
| GB-JUDICIARY | COURT | UNSUPPORTED, HTML | Not verified | 404 |
| GB-SUPREME | COURT | UNSUPPORTED, HTML, XML | sitemap.xml (XML) | No failure in tested requests |

## Representative documents

| Jurisdiction/source | Kind | Format | ID | Publication | Effective date | Version info | Citation | Machine/OCR |
|---|---|---|---|---|---|---|---|---|
| ID-DJPP | legislation | PDF | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | Extraction/review needed | TEXT_EXTRACTED_ALL_PAGES |
| ID-DJP | guidance | HTML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | html:article:48697 | true |
| ID-DJP | tax-page | HTML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | html:article:48144 | true |
| ID-JDIH | json-feed | JSON | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | #/items/0 | true |
| ID-JDIH | rss | XML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | xml:122 | true |
| ID-BPK | legislation-index | HTML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | html:document | true |
| SG-SSO | legislation | HTML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | Extraction/review needed | false |
| SG-IRAS | guidance | PDF | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | Extraction/review needed | TEXT_EXTRACTED_ALL_PAGES |
| SG-IRAS | tax-page | HTML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | html:main:233128 | true |
| SG-MOF | legislative-proposal-not-enacted | HTML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | html:article:7810 | true |
| US-ECFR | legislation-regulation | XML | 1.61-1 | Not extracted | NOT_ESTABLISHED | Not extracted | xml:254 | true |
| US-ECFR | api-titles | JSON | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | # | true |
| US-IRS | guidance | HTML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | html:main:70216 | true |
| US-IRS | tax-page | HTML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | html:main:81409 | true |
| US-USCODE | download-index | HTML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | html:document | true |
| AU-FRL | legislation | HTML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | html:document | true |
| AU-FRL | api-docs | JSON | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | # | true |
| AU-ATO | guidance-pdf | PDF | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | Extraction/review needed | TEXT_EXTRACTED_ALL_PAGES |
| AU-ATO | tax-page | HTML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | html:document | true |
| AU-ATO | content-endpoint | PDF | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | Extraction/review needed | TEXT_EXTRACTED_ALL_PAGES |
| GB-LEGISLATION | legislation | XML | http://www.legislation.gov.uk/ukpga/2024/3 | Not extracted | NOT_ESTABLISHED | Observed | xml:748 | true |
| GB-LEGISLATION | feed | XML | Not extracted | Not extracted | NOT_ESTABLISHED | Not extracted | xml:721 | true |
| GB-GOVUK | guidance | JSON | f29ca4a8-8ed9-4b0f-bb6a-11e373095dee | 2012-07-03T16:49:56+01:00 | NOT_ESTABLISHED | Not extracted | #/details/parts/0/body | true |
| GB-GOVUK | tax-page | JSON | 9b8a4862-56dc-47b1-b56b-8a647fdd72e5 | 2012-01-26T13:01:47+00:00 | NOT_ESTABLISHED | Not extracted | #/details/parts/0/body | true |
