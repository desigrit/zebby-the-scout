module.exports = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...require("./package.json").build,
  electronDist: "build/electron-arm64",
};
