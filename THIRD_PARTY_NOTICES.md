# Third-party notices

The project license applies to original PERSONALGYMTRACK code and documentation. Third-party dependencies, icons, data, and images retain their own terms. See the locked versions in [package-lock.json](package-lock.json) and the license files distributed with those packages.

| Material | License and source |
| --- | --- |
| Next.js, React, Supabase JavaScript and SSR, Papa Parse, Zod, Vitest, ESLint, ZXing Browser | MIT. See the respective package notices. ZXing Browser depends on the ZXing library, which is Apache-2.0. |
| TypeScript, Playwright, PGlite | Apache-2.0. Preserve upstream copyright, license, and applicable notice files when redistributing. |
| Lucide icons | ISC, with MIT terms for Feather-derived icons. See the [included copyright and permission notices](docs/licenses/lucide-feather.txt) from the locked package and the [upstream Lucide license](https://lucide.dev/license). |
| Open Food Facts | The database is under ODbL, individual database contents are under the Database Contents License, and product images are under CC BY-SA. Product data and images are retrieved at runtime and credited in the food lookup UI. Product packaging can carry additional third-party rights. [Open Food Facts license guidance](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/) |
| Product screenshots, charts, and muscle diagrams | Repository screenshots depict PERSONALGYMTRACK with synthetic records. Charts and diagrams are rendered by the app. Screenshots can include Lucide icons under the terms above. |
| Hevy | The app connects to the Hevy API when configured. Hevy names and user-supplied exports remain subject to their applicable rights and terms. [Hevy developer documentation](https://developers.hevy.com/) |

The lockfile also includes transitive licenses such as MPL-2.0 (Lightning CSS and axe-core), LGPL-3.0-or-later (optional Sharp/libvips binaries), and CC BY 4.0 (caniuse-lite). Those dependencies are installed from their upstream packages. When distributing a package, binary, or container that includes dependencies, review the licenses and source, attribution, and notice requirements for the actual contents of that distribution.
