import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { load } from "cheerio";
import JSZip from "jszip";
import { storeIdentity } from "./msix-package.mjs";

const productId = "9P4QWZ4DBF52";
const output = process.argv[2];
if (!output) throw new Error("Supply the destination for the Store identity JSON.");

async function publishedIdentity() {
  const url = new URL("https://displaycatalog.mp.microsoft.com/v7.0/products/" + productId);
  url.search = new URLSearchParams({ market: "US", languages: "en-US" }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("The Microsoft product catalog returned " + response.status);
  const { Product: product } = await response.json();
  if (product?.ProductId?.toUpperCase() !== productId) throw new Error("Unexpected Microsoft Store product.");
  const localized = product.LocalizedProperties?.[0];
  const skuPackages = (product.DisplaySkuAvailabilities || []).flatMap(item => item.Sku?.Properties?.Packages || []);
  const family = product.Properties?.PackageFamilyName || skuPackages.find(item => item.PackageFamilyName)?.PackageFamilyName;
  const publisher = [product.Properties?.PublisherCertificateName, ...skuPackages.map(item => item.PublisherCertificateName)].find(value => value?.startsWith("CN="));
  if (family && publisher && localized?.PublisherName) {
    return storeIdentity({ identityName: family.split("_")[0], publisher,
      publisherDisplayName: localized.PublisherName, packageFamilyName: family });
  }

  // Read the identity from Microsoft's published package when the catalog omits the certificate subject.
  const folder = await mkdtemp(path.join(tmpdir(), "zebby-store-"));
  execFileSync("winget", ["download", "--id", productId, "--exact", "--source", "msstore", "--skip-license",
    "--download-directory", folder, "--accept-source-agreements", "--accept-package-agreements", "--disable-interactivity"],
    { stdio: "inherit", timeout: 150000, windowsHide: true });
  const files = await readdir(folder, { recursive: true });
  for (const file of files.filter(item => /\.(msix|appx)(bundle)?$/i.test(item))) {
    let zip = await JSZip.loadAsync(await readFile(path.join(folder, file)));
    const manifest = zip.file("AppxMetadata/AppxBundleManifest.xml");
    if (manifest) {
      const bundle = load(await manifest.async("string"), { xml: true });
      const entry = bundle('Package[Type="application"][Architecture="x64"]').attr("FileName");
      if (!entry || !zip.file(entry)) continue;
      zip = await JSZip.loadAsync(await zip.file(entry).async("nodebuffer"));
    }
    const appManifest = zip.file("AppxManifest.xml");
    if (!appManifest) continue;
    const xml = load(await appManifest.async("string"), { xml: true });
    const identityName = xml("Package > Identity").attr("Name");
    if (!family || identityName !== family.split("_")[0]) continue;
    const display = xml("Package > Properties > PublisherDisplayName").text();
    return storeIdentity({ identityName, publisher: xml("Package > Identity").attr("Publisher"),
      publisherDisplayName: display.startsWith("ms-resource:") ? localized.PublisherName : display, packageFamilyName: family });
  }
  throw new Error("Microsoft did not supply an identifiable Zebby package.");
}

const identity = process.env.ZEBBY_STORE_IDENTITY_JSON
  ? storeIdentity(JSON.parse(process.env.ZEBBY_STORE_IDENTITY_JSON))
  : await publishedIdentity().catch(cause => {
    throw new Error("Set the repository variable ZEBBY_STORE_IDENTITY_JSON to Zebby's Partner Center identity. " + cause.message);
  });
await writeFile(output, JSON.stringify(identity));
console.log("Validated Store package family", identity.packageFamilyName);
