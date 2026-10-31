module.exports = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...require("./package.json").build,
  directories: { output: `work/msix/unpacked/${process.env.ZEBBY_MSIX_ARCH || "x64"}` },
  electronDist: process.env.ZEBBY_MSIX_ARCH === "arm64" ? "build/electron-arm64" : "node_modules/electron/dist",
};
