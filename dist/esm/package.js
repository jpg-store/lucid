export default {
    "name": "@jpg-store/lucid-cardano",
    "version": "0.12.3",
    "license": "MIT",
    "description": "This is a fork of the original Lucid repo compiled into CommonJS. For more information check https://github.com/spacebudz/lucid",
    "repository": "https://github.com/jpg-store/lucid",
    "module": "./dist/esm/mod.js",
    "main": "./dist/esm/mod.js",
    "types": "./dist/esm/mod.d.ts",
    "scripts": {
        "pack": "wasm-pack build --target nodejs --release"
    },
    "engines": {
        "node": ">=20"
    },
    "dependencies": {
        "@deno/shim-crypto": "^0.3.1",
        "ws": "^8.14.2"
    },
    "devDependencies": {
        "wasm-pack": "^0.12.1"
    },
    "type": "module",
    "exports": {
        ".": {
            "import": "./dist/esm/mod.js",
            "types": "./dist/types/mod.d.ts"
        }
    },
    "packageManager": "npm@10.4.0+sha256.0e4e5986526a578a6cdc5647cf862efba03dfcb063672f90bc525433b893fba9"
};
