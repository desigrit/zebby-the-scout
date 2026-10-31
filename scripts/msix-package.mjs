import { createHash } from "node:crypto";

// Microsoft's publisher ID is the first 64 bits of SHA-256 over the exact
// UTF-16LE publisher string, encoded with Crockford Base32 (13 characters).
export function publisherId(publisher) {
  const bytes = createHash("sha256").update(Buffer.from(publisher, "utf16le")).digest().subarray(0, 8);
  const bits = [...bytes].map(value => value.toString(2).padStart(8, "0")).join("") + "0";
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  return Array.from({ length: 13 }, (_, index) => alphabet[Number.parseInt(bits.slice(index * 5, index * 5 + 5), 2)]).join("");
}

export function storeIdentity(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Provide the identity values from Zebby's Partner Center Product identity page.");
  const { identityName, publisher, publisherDisplayName } = input;
  if (typeof identityName !== "string" || !/^[a-z\d][a-z\d.-]{2,49}$/i.test(identityName)) throw new Error("identityName must match Package/Identity/Name from Partner Center.");
  if (typeof publisher !== "string" || !publisher.startsWith("CN=") || publisher.length < 4 || publisher.length > 8192 || /[\r\n\u0000]/.test(publisher)) throw new Error("publisher must match Package/Identity/Publisher from Partner Center, including CN=.");
  if (typeof publisherDisplayName !== "string" || !publisherDisplayName.trim() || publisherDisplayName.length > 256 || /[\r\n\u0000]/.test(publisherDisplayName)) throw new Error("publisherDisplayName must match Package/Properties/PublisherDisplayName from Partner Center.");
  if ([identityName, publisher, publisherDisplayName].some(value => value !== value.trim() || /(?:REPLACE_ME|YOUR_PUBLISHER|TODO)/i.test(value))) throw new Error("Store identity values cannot contain placeholders or surrounding whitespace.");
  const packageFamilyName = `${identityName}_${publisherId(publisher)}`;
  if (input.packageFamilyName && input.packageFamilyName !== packageFamilyName) throw new Error("Package Family Name does not match the provided name and publisher.");
  return { identityName, publisher, publisherDisplayName, packageFamilyName };
}

export function storeVersion(version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:\.0)?$/.test(version)) throw new Error("Store versions must use major.minor.patch.0 with no prerelease suffix.");
  const parts = version.split(".").map(Number);
  if (parts[0] < 1 || parts.some(value => !Number.isInteger(value) || value > 65535)) throw new Error("Store version components must fit Windows package version limits.");
  return [...parts.slice(0, 3), 0].join(".");
}

function xml(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&apos;");
}

export function storeManifest(input, architecture, version) {
  const identity = storeIdentity(input);
  if (!["x64", "arm64"].includes(architecture)) throw new Error("Only Windows x64 and ARM64 are supported.");
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap uap10 rescap">
  <Identity Name="${xml(identity.identityName)}" Publisher="${xml(identity.publisher)}" Version="${storeVersion(version)}" ProcessorArchitecture="${architecture}" />
  <Properties>
    <DisplayName>Zebby</DisplayName>
    <PublisherDisplayName>${xml(identity.publisherDisplayName)}</PublisherDisplayName>
    <Description>Plan your resume and keep track of your job applications.</Description>
    <Logo>Assets\\StoreLogo.png</Logo>
    <uap10:PackageIntegrity><uap10:Content Enforcement="on" /></uap10:PackageIntegrity>
  </Properties>
  <Resources><Resource Language="en-US" /></Resources>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
  <Applications>
    <Application Id="Zebby" Executable="app\\Zebby.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="Zebby" Description="Plan your resume and keep track of your job applications."
        BackgroundColor="transparent" Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\\Wide310x150Logo.png" Square71x71Logo="Assets\\SmallTile.png" Square310x310Logo="Assets\\LargeTile.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient" />
    <Capability Name="privateNetworkClientServer" />
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
`;
}

export function assertPayloadArchitecture(bytes, architecture, label) {
  if (bytes.length < 64 || bytes.toString("ascii", 0, 2) !== "MZ") throw new Error(`${label} is not a Windows executable.`);
  const pe = bytes.readUInt32LE(0x3c);
  if (pe + 6 > bytes.length || bytes.toString("ascii", pe, pe + 4) !== "PE\0\0") throw new Error(`${label} has no valid PE header.`);
  const expected = architecture === "x64" ? 0x8664 : architecture === "arm64" ? 0xaa64 : 0;
  if (!expected || bytes.readUInt16LE(pe + 4) !== expected) throw new Error(`${label} does not match the ${architecture} package architecture.`);
}
