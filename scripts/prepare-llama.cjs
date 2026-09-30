module.exports = async function prepareLlama(context) {
  const { prepareRuntime } = await import("./download-llama.mjs");
  const architectures = ["ia32", "x64", "armv7l", "arm64", "universal"];
  await prepareRuntime(context.electronPlatformName, architectures[context.arch]);
};
