import assert from "node:assert/strict";
import { test } from "node:test";
import { publisherId, storeIdentity, storeManifest, storeVersion, assertPayloadArchitecture } from "../scripts/msix-package.mjs";

const microsoft = "CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US";
const identity = { identityName: "Zebby.StoreTest", publisher: "CN=Zebby Test", publisherDisplayName: "Zebby Test" };

test("Store identity uses Windows' published Microsoft publisher ID and rejects mismatched family names", () => {
  assert.equal(publisherId(microsoft), "8wekyb3d8bbwe");
  assert.equal(storeIdentity({ ...identity, publisher: microsoft }).packageFamilyName, "Zebby.StoreTest_8wekyb3d8bbwe");
  assert.throws(() => storeIdentity({ ...identity, packageFamilyName: "Other_identity" }), /Family Name/);
  for (const invalid of [{}, { ...identity, identityName: "Zebby space" }, { ...identity, publisher: "replace" }, { ...identity, publisherDisplayName: "" }, { ...identity, publisher: "CN=REPLACE_ME" }]) assert.throws(() => storeIdentity(invalid));
});

test("Store manifest preserves exact identity, bounds permissions and uses the correct architecture", () => {
  for (const arch of ["x64", "arm64"]) {
    const manifest = storeManifest({ ...identity, publisherDisplayName: 'Zebby & "Friends"' }, arch, "2.5.2");
    assert.match(manifest, new RegExp(`ProcessorArchitecture="${arch}"`));
    assert.match(manifest, /Version="2.5.2.0"/);
    assert.match(manifest, /Zebby &amp; &quot;Friends&quot;/);
    assert.match(manifest, /Windows.FullTrustApplication/);
    assert.match(manifest, /runFullTrust/);
    assert.doesNotMatch(manifest, /unvirtualizedResources|broadFileSystemAccess|allowElevation|runFullTrust.*runFullTrust|startupTask/);
    assert.match(manifest, /Content Enforcement="on"/);
  }
  assert.throws(() => storeManifest(identity, "x86", "2.5.2"));
});

test("Store versions reserve the fourth component and reject invalid identities", () => {
  assert.equal(storeVersion("2.5.2"), "2.5.2.0");
  assert.equal(storeVersion("2.5.2.0"), "2.5.2.0");
  for (const version of ["2.5.2.1", "2.5.2-beta", "0.1.0", "2.65536.1", "2.5", "2.5.2.0.0"]) assert.throws(() => storeVersion(version));
});

test("Architecture validation catches an x64 executable in an ARM64 package", () => {
  const bytes = Buffer.alloc(128); bytes.write("MZ"); bytes.writeUInt32LE(64, 0x3c); bytes.write("PE\0\0", 64); bytes.writeUInt16LE(0x8664, 68);
  assert.doesNotThrow(() => assertPayloadArchitecture(bytes, "x64", "Zebby.exe"));
  assert.throws(() => assertPayloadArchitecture(bytes, "arm64", "Zebby.exe"), /architecture/);
  bytes.writeUInt16LE(0xaa64, 68);
  assert.doesNotThrow(() => assertPayloadArchitecture(bytes, "arm64", "Zebby.exe"));
});
