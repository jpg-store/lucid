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
        "node": ">=20"
    },
    "dependencies": {
        "node-fetch": "^3.3.2",
        "@peculiar/webcrypto": "^1.4.3",
        "ws": "^8.14.2"
    },
    "type": "module",
    "exports": {
        ".": {
            "import": "./dist/esm/mod.js",
            "types": "./dist/types/mod.d.ts"
        }
    },
    "packageManager": "npm@10.2.4+sha256.36b548120f75f26408d04ff163cd4a699916f1c4b72ebeeab0bbaf054009eb5b"
};
