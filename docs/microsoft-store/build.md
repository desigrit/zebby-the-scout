# Microsoft Store build

The Store edition packages the same Electron app for Windows x64 and ARM64. It uses Microsoft Store updates and keeps databases outside the package's removable storage.

## Prepare a submission

1. Reserve Zebby in Partner Center.
2. Copy the exact values from **Product management > Product identity** into a local JSON file:

```json
{
  "identityName": "",
  "publisher": "",
  "publisherDisplayName": ""
}
```

Use `Package/Identity/Name`, `Package/Identity/Publisher` including `CN=`, and `Package/Properties/PublisherDisplayName`. Another app's Store ID or identity cannot be reused.

3. On Windows, install Node.js 22.13 or later and the Windows SDK with MakeAppx and MakePri. Run `npm ci`, then:

```powershell
npm run desktop:package:store -- --identity 'C:\path\Zebby-identity.json' --output 'C:\path\Store submission'
```

4. Upload `Packages\Zebby-<version>.0.msixbundle` in Partner Center. The bundle includes x64 and ARM64. Microsoft signs the upload after certification. Do not upload the two individual packages as well as the bundle.
5. Complete the fields in [the listing guide](listing-guide.md), including the privacy URL, screenshots, age rating, and certification notes.

The app version comes from `package.json`. MSIX adds a final `.0`, as required for Store submissions. Increment the app version before a later Store update.

## Prepare before the identity is available

```powershell
npm run desktop:package:store -- --prepare-only --output 'C:\path\Store submission'
npm run desktop:package:store -- --reuse-payloads --identity 'C:\path\Zebby-identity.json' --output 'C:\path\Store submission'
```

The prepared payload index records each architecture and its application archive hash. The second command checks those hashes before packaging. Both package manifests use the exact same identity and version, with only the architecture changing.

The local listing handoff also includes `Finalize Store package.ps1`, prebuilt payloads, assets, and a manifest template. That script accepts the three identity values and finishes packaging without Node.js or another app build. It uses MakePri and MakeAppx from the installed Windows SDK.

## Storage and updates

| Data | Store edition location |
| --- | --- |
| Settings, protected credentials, logs, downloaded models | `%LOCALAPPDATA%\Packages\<PackageFamilyName>\LocalState\Zebby` |
| Default database | `Documents\Zebby\Zebby Applications.sqlite` |
| Working databases and recovery copies | `%USERPROFILE%\Zebby\Recovery` |
| Preserved pending changes | `%USERPROFILE%\Zebby\Recovery\Recovered\<timestamp-id>` |

Each preserved folder contains `Zebby Applications.sqlite`, any SQLite journals, and `source.json` identifying the original database. Open a recovered copy explicitly when needed. Zebby does not automatically merge it into a cloud file.

Uninstall removes package-owned settings, logs, and models. Databases and recovery copies remain. The Store edition starts with an independent profile; open an existing database in Settings to reuse it. It does not move the standalone edition's private settings or downloads.

The Store channel is compiled into the app and also recognizes native package identity. It disables GitHub update downloads and installation. Settings opens Microsoft Store to manage updates.

## Validation

The build checks executable architecture, resource indexing, manifest validity, unsigned upload contents, and the hashes of packages embedded in the bundle. Windows x64 includes the CPU and Vulkan inference engines; ARM64 includes its CPU engine.

The `Installed Microsoft Store package` workflow installs a package on a disposable Windows runner using a temporary test certificate. Test signing stays on that runner. Production Store uploads remain unsigned.

Use the real Partner Center identity for submissions. `Zebby.StoreQA` is reserved in these scripts for local and CI validation and is not a production Store package.

## Microsoft references

- [Package requirements and identity](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)
- [Store policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)
- [Listing fields](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info)
