export default {
  "name": "@jpg-store/lucid-cardano",
  "version": "0.11.2",
  "license": "MIT",
  "description": "This is a fork of the original Lucid repo compiled into CommonJS. For more information check https://github.com/spacebudz/lucid",
  "repository": "https://github.com/jpg-store/lucid",
  "module": "./dist/esm/mod.js",
  "main": "./dist/esm/mod.js",
  "types": "./dist/types/mod.d.ts",
  "engines": {
    "node": ">=14"
  },
  "dependencies": {
    "node-fetch": "^3.2.3",
    "@peculiar/webcrypto": "^1.4.0",
    "ws": "^8.10.0"
  },
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/esm/mod.js",
      "types": "./dist/types/mod.d.ts"
    }
  }
};