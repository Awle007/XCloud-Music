# Third-party notices

Project-owned code is distributed under the root MIT license. Third-party code retains its original copyright and license. Music, lyrics, album art and user-provided media are separate from the source-code license.

## Locally bundled browser libraries

These pinned distributions live in `public/vendor/` and are copied unchanged in function into the deployment package. Runtime pages use local paths; no CDN is required. Original license files are included alongside each library. Documentation and license source links below are provenance, not runtime downloads.

| Library | Version | License | Local directory | Upstream project |
| --- | --- | --- | --- | --- |
| Bootstrap | 5.3.0 | MIT | `bootstrap/` | https://github.com/twbs/bootstrap |
| Bootstrap Icons | 1.11.1 | MIT | `bootstrap-icons/` | https://github.com/twbs/icons |
| Chart.js | 4.3.0 | MIT | `chart/` | https://github.com/chartjs/Chart.js |
| jQuery | 3.7.0 | MIT | `jquery/` | https://github.com/jquery/jquery |
| DataTables + Bootstrap 5 integration | 1.13.6 | MIT | `datatables/` | https://github.com/DataTables/DataTablesSrc |

The DataTables Chinese locale is the 1.13.6 plug-in distribution and is bundled as `datatables/zh.json`. Bootstrap Icons font files are included in `bootstrap-icons/fonts/` with the original relative CSS paths. Optional source-map comments are removed from the local minified distributions; original copyright banners are preserved.

## Package-managed dependencies

Vue, Vue Router, Pinia, Vite and the JavaScript test tooling retain the licenses recorded in their npm packages. Lucide Vue declares ISC. Full versions are pinned in `package-lock.json`; retain dependency notices when redistributing compiled assets.

PHPMailer is installed through `deploy/php/composer.json` and `composer.lock`. The pinned version 6.10.0 declares LGPL-2.1-only. Its license is included in `php/vendor/phpmailer/phpmailer/LICENSE` when dependencies are bundled. The project's MIT license does not replace the PHPMailer license.

## Existing project artwork

The existing logo, default cover, advertisement images, default avatars and fourteen loading-animation images are retained as project assets, with the previously remote loading images now stored under `public/loader-img/`. No music tracks are included. This notice records retention of existing assets and does not assert a new third-party artwork license; replace any artwork for which you need separate distribution permission before republishing it under your own brand.
